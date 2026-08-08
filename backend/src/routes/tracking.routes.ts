import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { VisitLog, VISIT_SITE_TYPES, type VisitSiteType } from '../models/VisitLog';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

// In-memory dedupe so a double-fire (e.g. refresh + beacon retry) is not double-counted.
// Key: `${session}|${siteType}|${siteId}|${page}`. Cheap and sufficient for single-node dev.
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

const SNIPPET = `(function () {
  if (navigator.doNotTrack === '1' || navigator.doNotTrack === 1) return;
  var script = document.currentScript;
  var siteType = (script && script.getAttribute('data-site-type')) || 'project';
  var siteId = script && script.getAttribute('data-site');
  if (!siteId) return;
  var base = '';
  if (script && script.src) {
    var idx = script.src.indexOf('/t.js');
    if (idx > -1) base = script.src.slice(0, idx);
  }
  var storageKey = '__aat_session';
  var session = '';
  try {
    session = window.localStorage.getItem(storageKey);
    if (!session) {
      session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(storageKey, session);
    }
  } catch (e) {
    session = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  var lastPage = '';
  var lastAt = 0;
  function track() {
    var page = window.location.pathname + window.location.search;
    var now = Date.now();
    if (page === lastPage && now - lastAt < 2000) return;
    lastPage = page;
    lastAt = now;
    var payload = JSON.stringify({
      siteType: siteType,
      siteId: siteId,
      page: page,
      referrer: document.referrer || '',
      session: session
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(base + '/api/track', payload);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', base + '/api/track', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payload);
    }
  }
  track();
  var wrap = function (orig) {
    return function () {
      var result = orig.apply(this, arguments);
      setTimeout(track, 0);
      return result;
    };
  };
  try {
    window.history.pushState = wrap(window.history.pushState);
    window.history.replaceState = wrap(window.history.replaceState);
    window.addEventListener('popstate', track);
  } catch (e) {}
})();`;

// GET /t.js — the embeddable tracking snippet.
export const serveTrackingScript = (_req: Request, res: Response): void => {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(SNIPPET);
};

// POST /api/track — anonymous pageview event from the snippet (public, no auth).
export const trackPageview = asyncHandler(async (req: Request, res: Response) => {
    // The snippet sends JSON via navigator.sendBeacon (which transmits text/plain) or an XHR
    // fallback (application/json) — normalize both into an object.
    let raw: unknown = req.body;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            throw new AppError(400, 'Invalid payload');
        }
    }
    const body = (raw ?? {}) as Record<string, unknown>;
    const siteType = body.siteType as unknown;
    const siteId = body.siteId as unknown;
    const page = typeof body.page === 'string' ? body.page.slice(0, 500) : '/';
    const referrer = typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : '';
    const session = typeof body.session === 'string' ? body.session.slice(0, 100) : '';

    if (
        typeof siteType !== 'string' ||
        !(VISIT_SITE_TYPES as readonly string[]).includes(siteType) ||
        typeof siteId !== 'string' ||
        !isValidObjectId(siteId)
    ) {
        throw new AppError(400, 'Invalid siteType or siteId');
    }

    const dedupeKey = `${session}|${siteType}|${siteId}|${page}`;
    const now = Date.now();
    const lastSeen = recent.get(dedupeKey);
    if (lastSeen !== undefined && now - lastSeen < DEDUPE_MS) {
        res.status(204).end();
        return;
    }
    recent.set(dedupeKey, now);
    // Opportunistic cleanup of stale entries.
    if (recent.size > 5000) {
        for (const [key, ts] of recent) {
            if (now - ts > 5 * 60_000) recent.delete(key);
        }
    }

    await VisitLog.create({
        siteType: siteType as VisitSiteType,
        siteId,
        page,
        referrer,
        session,
    });

    res.status(204).end();
});
