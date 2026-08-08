"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/api";

export function useResourceList<T>(
  path: string,
  extra?: Record<string, string | undefined>
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const extraKey = JSON.stringify(extra ?? null);
  // Keep the latest filter object in a ref so the fetch effect can use it
  // without re-running on every render (object identity changes each render).
  const extraRef = useRef(extra);
  useEffect(() => {
    extraRef.current = extra;
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (status !== "all") params.set("status", status);
    if (extraRef.current) {
      for (const [key, value] of Object.entries(extraRef.current)) {
        if (value) params.set(key, value);
      }
    }

    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setError(null);
        return http.get<T[]>(`${path}?${params.toString()}`);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setItems(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, debouncedSearch, status, refreshKey, extraKey]);

  return { items, loading, error, search, setSearch, status, setStatus, refresh };
}
