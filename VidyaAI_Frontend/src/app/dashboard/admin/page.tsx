"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AdminPerformancePanel } from "@/components/admin/AdminPerformancePanel";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { KpiSkeletonGrid } from "@/components/dashboard/DashboardSkeleton";
import {
  AnalyticsCard,
  AreaChart,
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  RadialProgress,
  StatSparkCard,
} from "@/components/analytics/charts";
import { api, getStoredUser } from "@/lib/api";
import {
  isScheduleLive,
  isScheduleToday,
  scheduleStart,
  type ScheduleLike,
} from "@/lib/dashboardSchedule";
import { normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import { adminDomainLabel } from "@/lib/servicePermissions";
import type { LectureSchedule, StudentPerformanceAnalytics } from "@/types";
import { BookOpen, Layers, Mic, Users } from "lucide-react";

export default function AdminDashboardPage() {
  const user = getStoredUser();
  const program = normalizeProgram(user?.program);
  const [stats, setStats] = useState<Record<string, unknown>>({});
  const [performance, setPerformance] = useState<StudentPerformanceAnalytics | null>(null);
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [dashboardStats, performanceStats, scheduleList] = await Promise.all([
        api.analytics(),
        api.studentPerformance(),
        api.schedules().catch(() => [] as LectureSchedule[]),
      ]);
      setStats(dashboardStats);
      setPerformance(performanceStats);
      setSchedules(scheduleList);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const values = [
    Number(stats.students ?? 0),
    Number(stats.books ?? 0),
    Number(stats.chapters ?? 0),
    Number(stats.lectures ?? 0),
  ];
  const maxVal = Math.max(...values, 1);

  const ops = useMemo(() => {
    const list = schedules as ScheduleLike[];
    const live = list.filter((s) => isScheduleLive(s)).length;
    const today = list.filter((s) => isScheduleToday(s)).length;
    const withRecording = list.filter((s) => s.has_recording).length;
    const attempts = performance?.scores_by_exam_type.reduce((n, r) => n + r.attempts, 0) ?? 0;
    return { live, today, withRecording, attempts };
  }, [schedules, performance]);

  const scheduleByWeekday = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const s of schedules) {
      const day = scheduleStart(s as ScheduleLike).getDay();
      const idx = day === 0 ? 6 : day - 1;
      counts[idx] += 1;
    }
    return counts;
  }, [schedules]);

  const contentDonut = [
    { label: "Books", value: Number(stats.books ?? 0), color: CHART_COLORS[1] },
    { label: "Chapters", value: Number(stats.chapters ?? 0), color: CHART_COLORS[2] },
    { label: "Lectures", value: Number(stats.lectures ?? 0), color: CHART_COLORS[3] },
  ].filter((s) => s.value > 0);

  const opsColumns = [
    { label: "Live", value: ops.live, color: CHART_COLORS[4] },
    { label: "Today", value: ops.today, color: CHART_COLORS[3] },
    { label: "Recordings", value: ops.withRecording, color: CHART_COLORS[1] },
    { label: "Attempts", value: ops.attempts, color: CHART_COLORS[2] },
  ];

  const lectureReadiness =
    Number(stats.chapters ?? 0) > 0
      ? Math.min(100, Math.round((Number(stats.lectures ?? 0) / Number(stats.chapters ?? 1)) * 100))
      : 0;

  const cards = [
    {
      label: "Students",
      value: stats.students ?? 0,
      icon: Users,
      color: CHART_COLORS[0],
      spark: [1, Number(stats.students ?? 0), Math.max(1, Number(stats.students ?? 0))],
    },
    {
      label: "Books",
      value: stats.books ?? 0,
      icon: BookOpen,
      color: CHART_COLORS[1],
      spark: scheduleByWeekday.slice(0, 4).map((n) => n + Number(stats.books ?? 0)),
    },
    {
      label: "Chapters",
      value: stats.chapters ?? 0,
      icon: Layers,
      color: CHART_COLORS[2],
      spark: [2, 5, 9, Number(stats.chapters ?? 0)],
    },
    {
      label: "Lectures",
      value: stats.lectures ?? 0,
      icon: Mic,
      color: CHART_COLORS[3],
      spark: [0, 1, 2, Number(stats.lectures ?? 0)],
    },
  ];

  return (
    <DashboardShell title="Admin Dashboard">
      <DashboardHero
        eyebrow={PROGRAM_SHORT[program]}
        title="Analytics overview"
        description="Institution-wide content health, teaching load, and learner performance."
        badge={adminDomainLabel(user?.program, user?.exam_track)}
        updatedAt={updatedAt}
        refreshing={refreshing}
        onRefresh={() => void load(true)}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <KpiSkeletonGrid count={4} />
      ) : (
        <div className="dashboard-kpi-grid mb-6">
          {cards.map((c) => (
            <StatSparkCard
              key={c.label}
              label={c.label}
              value={String(c.value)}
              percent={(Number(c.value) / maxVal) * 100}
              color={c.color}
              icon={c.icon}
              sparkline={c.spark}
            />
          ))}
        </div>
      )}

      <div className="dashboard-analytics-grid mb-6">
        <AnalyticsCard title="Content portfolio" subtitle="Books, chapters, and ready lectures">
          {contentDonut.length ? (
            <DonutChart
              centerLabel="Assets"
              centerValue={contentDonut.reduce((s, i) => s + i.value, 0)}
              segments={contentDonut}
            />
          ) : (
            <p className="text-sm text-slate-500">Upload curriculum to populate this chart.</p>
          )}
        </AnalyticsCard>

        <AnalyticsCard title="Operations pulse" subtitle="Live classes, today, recordings, exams">
          <ColumnChart items={opsColumns} />
        </AnalyticsCard>

        <AnalyticsCard title="Lecture readiness" subtitle="Ready lectures vs classified chapters">
          <div className="flex items-center justify-center py-2">
            <RadialProgress value={lectureReadiness} label="Ready rate" color={CHART_COLORS[1]} size={140} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-100">{ops.live}</p>
              Live
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-100">{ops.today}</p>
              Today
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-slate-100">{ops.attempts}</p>
              Attempts
            </div>
          </div>
        </AnalyticsCard>
      </div>

      <div className="mb-8">
        <AnalyticsCard title="Weekly schedule curve" subtitle="Classes planned across the week">
          <AreaChart
            points={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
              label,
              value: scheduleByWeekday[i] ?? 0,
            }))}
            color={CHART_COLORS[3]}
          />
        </AnalyticsCard>
      </div>

      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-100">Performance intelligence</h2>
        <p className="text-sm text-slate-500">
          Multi-chart view of domains, scores, curriculum density, and leaderboards.
        </p>
      </div>
      <AdminPerformancePanel
        data={performance}
        loading={loading}
        scheduleByWeekday={scheduleByWeekday}
        booksByGrade={
          "books_by_grade" in stats && stats.books_by_grade
            ? (stats.books_by_grade as Record<string, number>)
            : undefined
        }
      />
    </DashboardShell>
  );
}
