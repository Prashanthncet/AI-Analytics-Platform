"use client";

import type { ReactNode } from "react";
import { Activity, BarChart3, KeyRound, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: BarChart3, text: "Live deployment monitoring with uptime tracking and status alerts" },
  { icon: KeyRound, text: "Embedded visitor analytics — daily weekly monthly yearly totals" },
  { icon: ShieldCheck, text: "Downloadable PDF and CSV analytical reports on demand" },
];

export default function AuthShell({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(600px circle at 20% 20%, rgba(59,130,246,0.35), transparent 45%), radial-gradient(500px circle at 80% 70%, rgba(99,102,241,0.30), transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/50">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">AI Product Analytics</p>
            <p className="text-xs text-slate-400">Project & Product Intelligence Platform</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            Monitor projects, track visitors, and control costs from one platform.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Public dashboard with live deployment monitoring, embedded visitor analytics, API usage
            tracking, quota alerts, and downloadable analytical reports.
          </p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-500/30">
                  <f.icon className="h-3.5 w-3.5" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">Phase 2 · Monitoring & Analytics</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <p className="font-semibold text-slate-900">AI Product Analytics</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subheading}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
