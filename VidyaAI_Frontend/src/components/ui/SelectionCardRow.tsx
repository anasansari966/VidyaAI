"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";

export type SelectionCardItem = {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeTone?: "ready" | "live" | "muted";
  disabled?: boolean;
  icon?: ReactNode;
};

type SelectionCardRowProps = {
  label: string;
  hint?: string;
  items: SelectionCardItem[];
  value: string;
  onChange: (id: string) => void;
  emptyMessage?: string;
};

const badgeStyles = {
  ready: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  live: "bg-red-500/15 text-red-300 ring-red-500/25",
  muted: "bg-white/5 text-slate-400 ring-white/10",
};

export function SelectionCardRow({
  label,
  hint,
  items,
  value,
  onChange,
  emptyMessage = "Nothing available yet.",
}: SelectionCardRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScroll = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 4);
    setCanScrollRight(node.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    updateScrollState();
    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(node);

    return () => {
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      observer.disconnect();
    };
  }, [items, updateScrollState]);

  const scrollByCards = (direction: "left" | "right") => {
    const node = scrollerRef.current;
    if (!node) return;
    const amount = Math.max(240, node.clientWidth * 0.72);
    node.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!items.length) {
    return (
      <div>
        <p className="section-label mb-2">{label}</p>
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="section-label">{label}</p>
        <p className="text-xs text-slate-500">
          {hint ? `${hint} · ` : ""}
          Use the left and right arrows to browse
        </p>
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            type="button"
            aria-label={`Scroll ${label.toLowerCase()} left`}
            onClick={() => scrollByCards("left")}
            className="card-scroll-btn card-scroll-btn-left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            aria-label={`Scroll ${label.toLowerCase()} right`}
            onClick={() => scrollByCards("right")}
            className="card-scroll-btn card-scroll-btn-right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <div ref={scrollerRef} className="card-scroll-row scroll-area snap-x snap-mandatory">
          {items.map((item, index) => {
            const selected = item.id === value;
            const tone = item.badgeTone ?? "muted";
            return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              style={{ animationDelay: `${index * 40}ms` }}
              className={`selection-card picker-stagger snap-start ${
                selected ? "selection-card-active" : ""
              } ${item.disabled ? "selection-card-disabled" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                {item.icon ? (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-indigo-300">
                    {item.icon}
                  </span>
                ) : (
                  <span />
                )}
                {selected && <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-300" aria-hidden />}
              </div>
              <p className="mt-3 text-left text-sm font-semibold leading-snug text-slate-100">{item.label}</p>
              {item.sublabel && (
                <p className="mt-1 line-clamp-2 text-left text-xs leading-relaxed text-slate-500">{item.sublabel}</p>
              )}
              {item.badge && (
                <span
                  className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${badgeStyles[tone]}`}
                >
                  {item.badge}
                </span>
              )}
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
