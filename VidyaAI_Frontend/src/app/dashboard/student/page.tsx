"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import {
  AnalyticsCard,
  AreaChart,
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  HeatmapMatrix,
} from "@/components/analytics/charts";
import { StudentAnalytics } from "@/components/analytics/StudentAnalytics";
import { api, getStoredUser } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import {
  isScheduleToday,
  scheduleStart,
  type ScheduleLike,
} from "@/lib/dashboardSchedule";
import { hasSchedule, isSchoolProgram, normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import { userHasPermission } from "@/lib/servicePermissions";
import type { LectureSchedule, MyStudentPerformanceAnalytics, Recording } from "@/types";

export default function StudentDashboardPage() {
  const user = getStoredUser();
  const program = normalizeProgram(user?.program ?? (user as { track?: string } | null)?.track);
  const isSchool = isSchoolProgram(program);
  const showSchedule =
    Boolean(user) && isSchool && hasSchedule(program) && userHasPermission(user!, "schedule");

  const [performance, setPerformance] = useState<MyStudentPerformanceAnalytics | null>(null);
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const canLectures = Boolean(user && userHasPermission(user, "lectures"));
  const canRecordings = Boolean(user && userHasPermission(user, "recordings"));

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [perf, scheduleList, recordingList] = await Promise.all([
        api.myPerformance(),
        showSchedule || canLectures
          ? api.schedules().catch(() => [] as LectureSchedule[])
          : Promise.resolve([] as LectureSchedule[]),
        canRecordings
          ? api.recordings().catch(() => [] as Recording[])
          : Promise.resolve([] as Recording[]),
      ]);
      setPerformance(perf);
      setSchedules(scheduleList);
      setRecordings(recordingList);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showSchedule, canLectures, canRecordings]);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = user?.full_name
    ? `Welcome back, ${user.full_name.split(" ")[0]}`
    : `Welcome to ${PRODUCT_NAME}`;

  const description = isSchool
    ? user?.class_grade
      ? `Class ${user.class_grade} performance dashboard — learning, practice, and revision insights.`
      : `Your learning analytics across classes, practice, and revision.`
    : `${PROGRAM_SHORT[program]} analytics — live classes, practice, and progress.`;

  const scheduleByWeekday = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const s of schedules) {
      const day = scheduleStart(s as ScheduleLike).getDay();
      const idx = day === 0 ? 6 : day - 1;
      counts[idx] += 1;
    }
    return counts;
  }, [schedules]);

  const recordingBySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of recordings) {
      map.set(rec.subject, (map.get(rec.subject) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value], i) => ({
        label,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }))
      .slice(0, 6);
  }, [recordings]);

  const todayCount = schedules.filter((s) => isScheduleToday(s as ScheduleLike)).length;

  return (
    <DashboardShell title="Dashboard">
      <DashboardHero
        eyebrow={isSchool ? "Student analytics" : PROGRAM_SHORT[program]}
        title={greeting}
        description={description}
        badge={isSchool && user?.class_grade ? `Class ${user.class_grade}` : undefined}
        updatedAt={updatedAt}
        refreshing={refreshing}
        onRefresh={() => void load(true)}
      />

      {error ? (
        <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="dashboard-analytics-grid mb-8">
        <AnalyticsCard title="This week’s classes" subtitle="Scheduled sessions Mon–Sun">
          <AreaChart
            points={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({
              label,
              value: scheduleByWeekday[i] ?? 0,
            }))}
            color={CHART_COLORS[3]}
          />
          <p className="mt-2 text-xs text-slate-500">{todayCount} class{todayCount === 1 ? "" : "es"} today</p>
        </AnalyticsCard>

        <AnalyticsCard title="Revision library" subtitle="Recordings by subject">
          {recordingBySubject.length ? (
            <DonutChart
              centerLabel="Saved"
              centerValue={recordings.length}
              segments={recordingBySubject}
            />
          ) : (
            <p className="text-sm text-slate-500">Complete lectures to build your revision library.</p>
          )}
        </AnalyticsCard>

        <AnalyticsCard title="Study load" subtitle="Classes vs recordings vs practice">
          <ColumnChart
            items={[
              { label: "Classes", value: schedules.length, color: CHART_COLORS[3] },
              { label: "Recordings", value: recordings.length, color: CHART_COLORS[4] },
              {
                label: "Practice",
                value: performance?.practice_papers ?? 0,
                color: CHART_COLORS[2],
              },
            ]}
          />
        </AnalyticsCard>
      </div>

      {(performance?.progress_by_subject?.length ?? 0) > 0 ? (
        <div className="mb-8">
          <AnalyticsCard title="Subject focus map" subtitle="Heat intensity of completed vs available lectures">
            <HeatmapMatrix
              rows={(performance?.progress_by_subject ?? []).slice(0, 8).map((row) => ({
                label: row.subject,
                values: [row.completed, row.available, Math.round(row.completion_rate / 10)],
              }))}
            />
          </AnalyticsCard>
        </div>
      ) : null}

      <StudentAnalytics data={performance} isSchool={isSchool} loading={loading} />
    </DashboardShell>
  );
}
