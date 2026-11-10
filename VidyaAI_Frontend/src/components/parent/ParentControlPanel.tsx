"use client";

import { StudentAnalytics } from "@/components/analytics/StudentAnalytics";
import { PanelSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { ParentReportCards } from "@/components/parent/ParentReportCards";
import { isSchoolProgram, normalizeProgram } from "@/lib/programs";
import type { MyStudentPerformanceAnalytics, User } from "@/types";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  HeartHandshake,
  RefreshCw,
  ShieldCheck,
  Target,
  UserRound,
} from "lucide-react";

function statusForChild(data: MyStudentPerformanceAnalytics | null): {
  label: string;
  tone: string;
  hint: string;
} {
  if (!data || data.attempts === 0) {
    return {
      label: "Getting started",
      tone: "border-amber-400/30 bg-amber-500/10 text-amber-100",
      hint: "Encourage your child to complete their first practice paper.",
    };
  }
  if (data.avg_score >= 75) {
    return {
      label: "On track",
      tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
      hint: "Strong averages — keep the current study rhythm.",
    };
  }
  if (data.avg_score >= 50) {
    return {
      label: "Needs support",
      tone: "border-sky-400/30 bg-sky-500/10 text-sky-100",
      hint: "Scores are steady. Review weaker subjects together this week.",
    };
  }
  return {
    label: "Needs attention",
    tone: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    hint: "Reach out to the school teacher and plan short daily revision.",
  };
}

export function ParentControlPanel({
  linkedChildren,
  selectedChildId,
  onSelectChild,
  performance,
  loadingChildren,
  loadingPerformance,
  error,
  onRefresh,
  reportsRefreshKey = 0,
}: {
  linkedChildren: User[];
  selectedChildId: number | null;
  onSelectChild: (id: number) => void;
  performance: MyStudentPerformanceAnalytics | null;
  loadingChildren: boolean;
  loadingPerformance: boolean;
  error: string;
  onRefresh: () => void;
  reportsRefreshKey?: number;
}) {
  const selectedChild = linkedChildren.find((child) => child.id === selectedChildId) ?? null;
  const program = normalizeProgram(selectedChild?.program);
  const isSchool = isSchoolProgram(program);
  const status = statusForChild(performance);
  const completed = performance?.lectures_completed ?? 0;
  const upcoming = performance?.upcoming_classes ?? 0;
  const attempts = performance?.attempts ?? 0;
  const avg = performance?.avg_score ?? 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-teal-400/20 bg-gradient-to-br from-teal-500/15 via-slate-900/40 to-cyan-500/10 px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200/90">
              <HeartHandshake className="h-3.5 w-3.5" aria-hidden />
              Parental control
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Your children&apos;s learning at a glance
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              This panel is read-only. You can monitor lectures, practice scores, and progress —
              without changing your child&apos;s account or assignments.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" aria-hidden />
            School-linked access only
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
            <UserRound className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
            Switch between linked children below
          </span>
        </div>
      </section>

      {loadingChildren ? (
        <PanelSkeleton rows={3} />
      ) : linkedChildren.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="text-sm text-slate-300">
            No students are linked to your parent account yet. Ask your school admin to add your
            mobile number and parent password when creating or importing the student.
          </p>
        </div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Linked children</h3>
                <p className="mt-0.5 text-xs text-slate-400">Select a child to view their progress.</p>
              </div>
              <p className="text-xs text-slate-500">{linkedChildren.length} linked</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {linkedChildren.map((child) => {
                const active = child.id === selectedChildId;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelectChild(child.id)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? "border-teal-400/40 bg-teal-500/15 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{child.full_name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {child.class_grade ? `Class ${child.class_grade}` : "Program student"}
                          {child.program ? ` · ${String(child.program).toUpperCase()}` : ""}
                        </p>
                      </div>
                      {active && (
                        <span className="rounded-md bg-teal-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-100">
                          Viewing
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedChild && (
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{selectedChild.full_name}</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{status.hint}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      icon: Target,
                      label: "Average score",
                      value: loadingPerformance ? "…" : attempts ? `${avg}%` : "—",
                    },
                    {
                      icon: BookOpen,
                      label: "Lectures done",
                      value: loadingPerformance ? "…" : String(completed),
                    },
                    {
                      icon: CalendarDays,
                      label: "Upcoming classes",
                      value: loadingPerformance ? "…" : String(upcoming),
                    },
                    {
                      icon: CheckCircle2,
                      label: "Practice attempts",
                      value: loadingPerformance ? "…" : String(attempts),
                    },
                  ].map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3"
                    >
                      <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                        <Icon className="h-3.5 w-3.5 text-teal-300" aria-hidden />
                        {label}
                      </div>
                      <p className="text-xl font-semibold text-slate-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-sm font-semibold text-slate-100">Recent practice</h3>
                <p className="mt-1 text-xs text-slate-400">Latest submitted papers for this child.</p>
                {loadingPerformance ? (
                  <div className="mt-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                    ))}
                  </div>
                ) : !performance?.recent_attempts?.length ? (
                  <p className="mt-4 text-sm text-slate-400">No practice submissions yet.</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {performance.recent_attempts.slice(0, 5).map((attempt) => (
                      <li
                        key={attempt.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-200">{attempt.title}</p>
                          <p className="text-xs text-slate-500">
                            {attempt.subject}
                            {attempt.submitted_at
                              ? ` · ${new Date(attempt.submitted_at).toLocaleDateString()}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-teal-200">
                          {attempt.percent != null ? `${attempt.percent}%` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          <ParentReportCards studentId={selectedChildId} refreshKey={reportsRefreshKey} />

          <StudentAnalytics
            data={performance}
            isSchool={isSchool}
            loading={loadingPerformance}
            heading="Detailed progress"
            emptyLabel="No practice or lecture activity yet for this student."
          />
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
