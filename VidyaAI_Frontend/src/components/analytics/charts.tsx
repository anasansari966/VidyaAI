"use client";

export const CHART_COLORS = [
  "#6366f1",
  "#22d3ee",
  "#a855f7",
  "#f59e0b",
  "#34d399",
  "#fb7185",
  "#818cf8",
  "#fcd34d",
];

export type ChartSegment = {
  label: string;
  value: number;
  color?: string;
};

export function AnalyticsCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`analytics-card min-w-0 overflow-hidden ${className}`.trim()}>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function BarChart({
  items,
  valueKey = "value",
  labelKey = "label",
  suffix = "",
  emptyMessage = "No data yet.",
}: {
  items: Record<string, unknown>[];
  valueKey?: string;
  labelKey?: string;
  suffix?: string;
  emptyMessage?: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((item) => Number(item[valueKey]) || 0), 1);

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = Number(item[valueKey]) || 0;
        const width = Math.max(6, (value / max) * 100);
        return (
          <div key={String(item[labelKey])}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{String(item[labelKey])}</span>
              <span className="font-semibold tabular-nums text-slate-200">
                {value}
                {suffix}
              </span>
            </div>
            <div className="analytics-bar-track">
              <div
                className="analytics-bar-fill"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]}88)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ColumnChart({
  items,
  suffix = "",
}: {
  items: ChartSegment[];
  suffix?: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">No data yet.</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="flex h-44 items-end justify-between gap-1.5 pt-2 sm:gap-2">
      {items.map((item, index) => {
        const height = Math.max(8, (item.value / max) * 100);
        const color = item.color ?? CHART_COLORS[index % CHART_COLORS.length];
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] font-semibold tabular-nums text-slate-300 sm:text-xs">
              {item.value}
              {suffix}
            </span>
            <div className="analytics-column-track flex w-full items-end justify-center">
              <div
                className="analytics-column-fill w-full max-w-[2.5rem] rounded-t-md"
                style={{
                  height: `${height}%`,
                  background: `linear-gradient(180deg, ${color}, ${color}55)`,
                  boxShadow: `0 0 20px ${color}33`,
                }}
              />
            </div>
            <span
              className="w-full px-0.5 text-center text-[9px] leading-tight text-slate-500 sm:text-[10px]"
              title={item.label}
            >
              <span className="line-clamp-2 break-words">{item.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: ChartSegment[];
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const filtered = segments.filter((s) => s.value > 0);
  const total = filtered.reduce((sum, s) => sum + s.value, 0);

  if (!total) {
    return <p className="text-sm text-slate-500">No data yet.</p>;
  }

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const arcs = filtered.map((segment, index) => {
    const previousValue = filtered
      .slice(0, index)
      .reduce((sum, item) => sum + item.value, 0);
    const dash = (segment.value / total) * circumference;
    return {
      segment,
      dash,
      offset: (previousValue / total) * circumference,
      color: segment.color ?? CHART_COLORS[index % CHART_COLORS.length],
    };
  });

  return (
    <div className="analytics-donut flex min-w-0 flex-col items-stretch gap-4">
      <div className="analytics-donut-plot relative mx-auto h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          {arcs.map(({ segment, dash, offset, color }) => (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              className="analytics-donut-segment"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue !== undefined ? (
            <span className="text-xl font-bold text-white sm:text-2xl">{centerValue}</span>
          ) : null}
          {centerLabel ? (
            <span className="text-[10px] uppercase tracking-wider text-slate-500">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="analytics-donut-legend min-w-0 flex-1 space-y-2">
        {filtered.map((seg, index) => {
          const color = seg.color ?? CHART_COLORS[index % CHART_COLORS.length];
          const pct = Math.round((seg.value / total) * 100);
          return (
            <div
              key={seg.label}
              className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 text-sm sm:gap-x-3"
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span
                className="min-w-0 truncate whitespace-nowrap text-slate-400 leading-snug"
                title={seg.label}
              >
                {seg.label}
              </span>
              <span className="shrink-0 tabular-nums text-right text-slate-200">
                {seg.value}{" "}
                <span className="text-slate-500">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatSparkCard({
  label,
  value,
  percent,
  color,
  icon: Icon,
  sparkline,
}: {
  label: string;
  value: string | number;
  percent: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  sparkline?: number[];
}) {
  return (
    <div className="analytics-stat-card">
      <div className="mb-3 flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl font-bold tabular-nums text-white">{value}</span>
      </div>
      <p className="mb-2 text-sm text-slate-400">{label}</p>
      {sparkline && sparkline.length > 1 ? (
        <div className="mb-2 h-8">
          <Sparkline values={sparkline} color={color} />
        </div>
      ) : null}
      <div className="analytics-bar-track h-1.5">
        <div
          className="analytics-bar-fill h-1.5 rounded-full"
          style={{ width: `${Math.min(100, Math.max(4, percent))}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  color = CHART_COLORS[0],
  height = 32,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 120;
  const h = height;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const area = `0,${h} ${points.join(" ")} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      <polygon points={area} fill={`${color}22`} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AreaChart({
  points,
  suffix = "",
  color = CHART_COLORS[0],
  emptyMessage = "No trend data yet.",
}: {
  points: { label: string; value: number }[];
  suffix?: string;
  color?: string;
  emptyMessage?: string;
}) {
  if (!points.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const max = Math.max(...points.map((p) => p.value), 1);
  const w = 320;
  const h = 140;
  const padX = 8;
  const padY = 12;
  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * (w - padX * 2);
    const y = h - padY - (p.value / max) * (h - padY * 2);
    return { x, y, ...p };
  });
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `${padX},${h - padY} ${line} ${coords[coords.length - 1].x},${h - padY}`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={h - padY - t * (h - padY * 2)}
            y2={h - padY - t * (h - padY * 2)}
            stroke="rgba(255,255,255,0.05)"
          />
        ))}
        <polygon points={area} fill={`${color}28`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <circle key={c.label} cx={c.x} cy={c.y} r="3.5" fill={color} />
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-7 gap-0.5 sm:gap-1">
        {points.map((p) => (
          <div key={p.label} className="min-w-0 text-center">
            <p className="text-[9px] text-slate-500 sm:text-[10px]" title={p.label}>
              {p.label}
            </p>
            <p className="text-[10px] font-semibold tabular-nums text-slate-300 sm:text-[11px]">
              {p.value}
              {suffix}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadarChart({
  axes,
  emptyMessage = "No data yet.",
}: {
  axes: ChartSegment[];
  emptyMessage?: string;
}) {
  if (!axes.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 70;
  const max = Math.max(...axes.map((a) => a.value), 1);
  const angleStep = (Math.PI * 2) / axes.length;

  function point(index: number, value: number) {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = (value / max) * radius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  }

  const polygon = axes
    .map((a, i) => {
      const p = point(i, a.value);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="analytics-radar flex flex-col items-center gap-3">
      <svg viewBox={`0 0 ${size} ${size}`} className="analytics-radar-plot h-44 w-44 shrink-0">
        {[0.35, 0.7, 1].map((t) => (
          <polygon
            key={t}
            points={axes
              .map((_, i) => {
                const p = point(i, max * t);
                return `${p.x},${p.y}`;
              })
              .join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
          />
        ))}
        {axes.map((_, i) => {
          const tip = point(i, max);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke="rgba(255,255,255,0.08)"
            />
          );
        })}
        <polygon points={polygon} fill={`${CHART_COLORS[1]}33`} stroke={CHART_COLORS[1]} strokeWidth="2" />
        {axes.map((a, i) => {
          const p = point(i, a.value);
          return <circle key={a.label} cx={p.x} cy={p.y} r="3" fill={a.color ?? CHART_COLORS[i % CHART_COLORS.length]} />;
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-2">
        {axes.map((a) => (
          <div key={a.label} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0 break-words text-slate-400" title={a.label}>
              {a.label}
            </span>
            <span className="shrink-0 tabular-nums text-slate-200">{a.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadialProgress({
  value,
  label,
  color = CHART_COLORS[4],
  size = 120,
}: {
  value: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-white">{Math.round(clamped)}%</span>
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">{label}</p>
    </div>
  );
}

export function HeatmapMatrix({
  rows,
  emptyMessage = "No activity data yet.",
}: {
  rows: { label: string; values: number[] }[];
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const max = Math.max(...rows.flatMap((r) => r.values), 1);
  const cols = Math.max(...rows.map((r) => r.values.length), 0);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(4.5rem,35%)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(6rem,30%)_1fr_auto] sm:gap-3">
          <span
            className="min-w-0 break-words text-left text-[10px] leading-tight text-slate-500 sm:text-[11px]"
            title={row.label}
          >
            {row.label}
          </span>
          <div className="grid min-w-0 gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {row.values.map((v, i) => {
              const intensity = v / max;
              return (
                <div
                  key={`${row.label}-${i}`}
                  title={`${row.label}: ${v}`}
                  className="h-6 rounded-md border border-white/[0.04] sm:h-7"
                  style={{
                    background: `rgba(34, 211, 238, ${0.08 + intensity * 0.72})`,
                  }}
                />
              );
            })}
          </div>
          <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-slate-400 sm:w-8 sm:text-[11px]">
            {row.values.reduce((a, b) => a + b, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}
