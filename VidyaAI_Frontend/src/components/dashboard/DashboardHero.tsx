"use client";

import { RefreshCw } from "lucide-react";

export function DashboardHero({
  eyebrow,
  title,
  description,
  badge,
  updatedAt,
  onRefresh,
  refreshing = false,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: string;
  updatedAt?: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent p-4 sm:mb-6 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
              {eyebrow}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
              {title}
            </h1>
            {badge ? (
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p> : null}
          {updatedAt ? (
            <p className="mt-2 text-[11px] text-slate-600">
              Updated {updatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </p>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:text-white disabled:opacity-50 sm:min-h-0 sm:flex-none"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
