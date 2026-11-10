"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import type { LectureSchedule } from "@/types";
import { Calendar, Loader2, Mic } from "lucide-react";

function formatScheduleTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StudentSchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .schedules()
      .then(setSchedules)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const upcoming = schedules.filter((s) => s.status === "scheduled" || s.status === "live");
  const past = schedules.filter((s) => s.status === "completed");

  return (
    <DashboardShell title="My Schedule">
      {loading ? (
        <div className="glass flex min-h-[240px] items-center justify-center rounded-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="glass rounded-2xl p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold">Upcoming & live classes</h2>
            </div>
            {!upcoming.length ? (
              <p className="text-sm text-slate-400">No classes scheduled yet. Check back later.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        Class {item.class_grade} · {item.subject}
                      </p>
                      <p className="text-sm text-slate-300">
                        Ch. {item.chapter_number}: {item.chapter_title}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{formatScheduleTime(item.scheduled_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          item.status === "live"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-indigo-500/20 text-indigo-200"
                        }`}
                      >
                        {item.status === "live" ? "Live now" : "Scheduled"}
                      </span>
                      {item.lecture_id && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/student/lectures/classroom?lecture=${item.lecture_id}`)
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-400"
                        >
                          <Mic className="h-4 w-4" />
                          Join
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="glass rounded-2xl p-5 md:p-6">
              <h2 className="mb-4 font-semibold">Completed classes</h2>
              <ul className="space-y-2">
                {past.map((item) => (
                  <li key={item.id} className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                    Ch. {item.chapter_number}: {item.chapter_title} — {formatScheduleTime(item.scheduled_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
