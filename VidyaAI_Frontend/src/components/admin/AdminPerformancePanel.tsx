"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AnalyticsCard,
  AreaChart,
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  HeatmapMatrix,
  RadarChart,
  RadialProgress,
} from "@/components/analytics/charts";
import { PanelSkeleton } from "@/components/dashboard/DashboardSkeleton";
import type { StudentPerformanceAnalytics } from "@/types";

type TopStudent = StudentPerformanceAnalytics["top_students"][number];

function PerformersTable({ students }: { students: TopStudent[] }) {
  if (students.length === 0) {
    return <p className="text-sm text-slate-500">No submitted practice results yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/[0.06] bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Rank</th>
            <th className="px-4 py-3 font-medium">Student</th>
            <th className="px-4 py-3 font-medium">Domain</th>
            <th className="px-4 py-3 font-medium">Avg score</th>
            <th className="px-4 py-3 font-medium">Attempts</th>
            <th className="px-4 py-3 font-medium">Best mock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {students.map((student, index) => (
            <tr key={student.student_id} className="text-slate-300 transition hover:bg-white/[0.02]">
              <td className="px-4 py-3 text-slate-500">{index + 1}</td>
              <td className="px-4 py-3 font-medium text-slate-100">
                <Link
                  href={`/dashboard/admin/records/${student.student_id}${
                    student.class_grade != null ? `?class=${student.class_grade}` : "?class=unassigned"
                  }`}
                  className="hover:text-sky-200"
                >
                  {student.full_name}
                </Link>
              </td>
              <td className="px-4 py-3 capitalize">{student.program.replace("_", " ")}</td>
              <td className="px-4 py-3">
                <span
                  className={`tabular-nums font-semibold ${
                    student.avg_score >= 70
                      ? "text-emerald-300"
                      : student.avg_score >= 40
                        ? "text-amber-300"
                        : "text-slate-300"
                  }`}
                >
                  {student.avg_score}%
                </span>
              </td>
              <td className="px-4 py-3">{student.attempts}</td>
              <td className="px-4 py-3">
                {student.best_mock_score != null ? `${student.best_mock_score}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPerformancePanel({
  data,
  booksByGrade,
  scheduleByWeekday,
  loading = false,
}: {
  data: StudentPerformanceAnalytics | null;
  booksByGrade?: Record<string, number>;
  scheduleByWeekday?: number[];
  loading?: boolean;
}) {
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const domainTabs = useMemo(() => {
    if (!data) return [{ key: "all", label: "All domains" }];
    const keys = Object.keys(data.domain_leaderboards ?? {});
    return [
      { key: "all", label: "All domains" },
      ...keys.map((key) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
    ];
  }, [data]);

  const filteredTop = useMemo(() => {
    if (!data) return [];
    if (domainFilter === "all") return data.top_students;
    return (
      data.domain_leaderboards?.[domainFilter] ??
      data.top_students.filter((s) => s.program === domainFilter)
    );
  }, [data, domainFilter]);

  if (loading || !data) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={4} />
      </div>
    );
  }

  const totalStudents = data.students_by_domain.reduce((sum, row) => sum + row.count, 0);
  const totalAttempts = data.scores_by_exam_type.reduce((sum, row) => sum + row.attempts, 0);
  const avgAcross = data.scores_by_exam_type.length
    ? Math.round(
        data.scores_by_exam_type.reduce((sum, row) => sum + row.avg_score, 0) /
          data.scores_by_exam_type.length
      )
    : 0;

  const scoreTrend = data.scores_by_exam_type.map((row) => ({
    label: row.label.replace(/ test|term/gi, "").slice(0, 10),
    value: row.avg_score,
  }));

  const attemptColumns = data.scores_by_exam_type.map((row, i) => ({
    label: row.label,
    value: row.attempts,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const radarAxes = [
    ...data.students_by_domain.map((row) => ({
      label: row.label.split(" ")[0],
      value: row.count,
    })),
    ...data.scores_by_exam_type.slice(0, 3).map((row) => ({
      label: row.label.split(" ")[0],
      value: Math.max(row.avg_score, 1),
    })),
  ].slice(0, 6);

  const booksHeat =
    booksByGrade && Object.keys(booksByGrade).length
      ? Object.entries(booksByGrade).map(([grade, count]) => ({
          label: `C${grade}`,
          values: [count, Math.max(0, count - 1), Math.max(1, Math.round(count * 0.6))],
        }))
      : [];

  const weekdayHeat =
    scheduleByWeekday && scheduleByWeekday.some((n) => n > 0)
      ? [
          {
            label: "Classes",
            values: scheduleByWeekday,
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Learners tracked</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-50">{totalStudents}</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">Exam attempts</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-50">{totalAttempts}</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">Avg exam score</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-50">
              {totalAttempts ? `${avgAcross}%` : "—"}
            </p>
          </div>
          <RadialProgress value={avgAcross} label="Institution avg" color={CHART_COLORS[4]} size={88} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AnalyticsCard title="Students by domain" subtitle="Enrollment mix across learning paths">
          <DonutChart
            centerLabel="Students"
            centerValue={totalStudents}
            segments={data.students_by_domain.map((row) => ({
              label: row.label,
              value: row.count,
            }))}
          />
        </AnalyticsCard>

        <AnalyticsCard title="Score trend by exam type" subtitle="Average performance curve">
          <AreaChart points={scoreTrend} suffix="%" color={CHART_COLORS[1]} />
        </AnalyticsCard>

        <AnalyticsCard title="Assessment volume" subtitle="Submitted papers by exam type">
          <ColumnChart items={attemptColumns} />
        </AnalyticsCard>

        <AnalyticsCard title="Capability radar" subtitle="Domain size vs exam strength signals">
          <RadarChart axes={radarAxes.length ? radarAxes : [{ label: "Students", value: totalStudents || 1 }]} />
        </AnalyticsCard>

        {booksHeat.length > 0 ? (
          <AnalyticsCard title="Curriculum density" subtitle="Books intensity by class (heatmap)">
            <HeatmapMatrix rows={booksHeat} />
            <p className="mt-3 text-[11px] text-slate-600">Rows = class · cells = relative content load</p>
          </AnalyticsCard>
        ) : null}

        {weekdayHeat.length > 0 ? (
          <AnalyticsCard
            title="Weekly teaching load"
            subtitle="Scheduled classes Mon–Sun"
            className={booksHeat.length ? "" : "lg:col-span-2"}
          >
            <div className="mb-2 flex justify-between px-16 text-[10px] text-slate-600">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={`${d}-${i}`}>{d}</span>
              ))}
            </div>
            <HeatmapMatrix rows={weekdayHeat} />
          </AnalyticsCard>
        ) : null}
      </div>

      <AnalyticsCard title="Top performers" subtitle="Ranked by average score across submitted exams">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {domainTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDomainFilter(tab.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                  domainFilter === tab.key
                    ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30"
                    : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/admin/students"
            className="text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            Manage students →
          </Link>
        </div>
        <PerformersTable students={filteredTop} />
      </AnalyticsCard>
    </div>
  );
}
