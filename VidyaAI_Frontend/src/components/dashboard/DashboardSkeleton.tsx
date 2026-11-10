"use client";

export function KpiSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="dashboard-kpi-grid mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="analytics-stat-card animate-pulse"
        >
          <div className="mb-3 flex items-start justify-between">
            <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
            <div className="h-7 w-12 rounded bg-white/[0.06]" />
          </div>
          <div className="mb-3 h-4 w-24 rounded bg-white/[0.05]" />
          <div className="h-1.5 w-full rounded-full bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="analytics-card animate-pulse space-y-3">
      <div className="h-5 w-40 rounded bg-white/[0.06]" />
      <div className="h-3 w-56 rounded bg-white/[0.04]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 w-full rounded-lg bg-white/[0.04]" />
      ))}
    </div>
  );
}
