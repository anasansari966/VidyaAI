"use client";

import Link from "next/link";
import { CalendarClock, Radio } from "lucide-react";
import {
  formatScheduleWhen,
  isScheduleLive,
  type ScheduleLike,
} from "@/lib/dashboardSchedule";

export function UpcomingScheduleCard({
  schedule,
  href,
  emptyHref,
  emptyLabel = "No classes scheduled yet",
  emptyCta = "Browse subjects",
}: {
  schedule: ScheduleLike | null;
  href: string;
  emptyHref: string;
  emptyLabel?: string;
  emptyCta?: string;
}) {
  if (!schedule) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-5">
        <div className="flex items-center gap-2 text-slate-500">
          <CalendarClock className="h-4 w-4" />
          <p className="text-sm">{emptyLabel}</p>
        </div>
        <Link
          href={emptyHref}
          className="mt-3 inline-flex text-xs font-medium text-cyan-300/90 hover:text-cyan-200"
        >
          {emptyCta} →
        </Link>
      </div>
    );
  }

  const live = isScheduleLive(schedule);

  return (
    <Link
      href={href}
      className={`block rounded-2xl border p-5 transition ${
        live
          ? "border-emerald-400/30 bg-emerald-500/10 hover:border-emerald-400/45"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/15"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {live ? "Live class" : "Up next"}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-100">
            {schedule.subject}
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">{schedule.chapter_title}</p>
        </div>
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            <Radio className="h-3 w-3 animate-pulse" />
            Live
          </span>
        ) : (
          <CalendarClock className="h-5 w-5 text-amber-400/80" />
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Class {schedule.class_grade} · {formatScheduleWhen(schedule)} ·{" "}
        {Math.round(schedule.duration_minutes)} min
      </p>
    </Link>
  );
}
