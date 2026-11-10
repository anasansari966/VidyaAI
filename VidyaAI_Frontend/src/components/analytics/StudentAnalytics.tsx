"use client";

import {
  AnalyticsCard,
  AreaChart,
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  HeatmapMatrix,
  RadarChart,
  RadialProgress,
  StatSparkCard,
} from "@/components/analytics/charts";
import { PanelSkeleton } from "@/components/dashboard/DashboardSkeleton";
import type { MyStudentPerformanceAnalytics } from "@/types";
import { BookOpen, Calendar, CheckCircle2, PenLine, PlayCircle, Target, Trophy } from "lucide-react";

function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <PanelSkeleton rows={2} />
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="analytics-stat-card animate-pulse">
            <div className="mb-3 flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
              <div className="h-7 w-12 rounded bg-white/[0.06]" />
            </div>
            <div className="mb-3 h-4 w-24 rounded bg-white/[0.05]" />
            <div className="h-1.5 w-full rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
      <div className="dashboard-analytics-grid">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}

export function StudentAnalytics({
  data,
  isSchool,
  loading = false,
  heading = "Your performance",
  emptyLabel = "Complete practice papers to see your scores here.",
}: {
  data: MyStudentPerformanceAnalytics | null;
  isSchool: boolean;
  loading?: boolean;
  heading?: string;
  emptyLabel?: string;
}) {
  if (loading || !data) {
    return <AnalyticsLoading />;
  }

  const completed = data.lectures_completed ?? 0;
  const inProgress = data.lectures_in_progress ?? 0;
  const practice = data.practice_papers ?? 0;
  const upcoming = data.upcoming_classes ?? 0;
  const subjects = data.subjects_available ?? 0;
  const learningTotal = completed + inProgress || 1;
  const activityMax = Math.max(completed, inProgress, practice, upcoming, subjects, 1);
  const completionRate = Math.round((completed / learningTotal) * 100);

  const scoreTrend = [...data.recent_attempts]
    .reverse()
    .slice(-8)
    .map((attempt, index) => ({
      label: attempt.submitted_at
        ? new Date(attempt.submitted_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : `#${index + 1}`,
      value: attempt.percent,
    }));

  const examRadar = data.scores_by_exam_type.map((row) => ({
    label: row.label,
    value: Math.max(row.avg_score, 1),
  }));

  const subjectHeat = data.progress_by_subject.slice(0, 6).map((row) => ({
    label: row.subject,
    values: [row.completed, row.available, Math.round(row.completion_rate / 10)],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-cyan-500/10 via-white/[0.02] to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-cyan-300/80">{heading}</p>
          <h2 className="mt-1 break-words text-lg font-semibold text-slate-100">{data.full_name}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {data.attempts > 0
              ? `${data.avg_score}% average across ${data.attempts} submitted exam${data.attempts === 1 ? "" : "s"}`
              : emptyLabel}
            {data.best_mock_score != null ? ` · Best mock: ${data.best_mock_score}%` : ""}
          </p>
        </div>
        <div className="mx-auto shrink-0 sm:mx-0">
          <RadialProgress
            value={data.attempts > 0 ? data.avg_score : completionRate}
            label={data.attempts > 0 ? "Avg score" : "Lecture progress"}
            color={CHART_COLORS[1]}
            size={96}
          />
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <StatSparkCard
          label="Lectures completed"
          value={completed}
          percent={(completed / activityMax) * 100}
          color={CHART_COLORS[4]}
          icon={CheckCircle2}
          sparkline={[0, Math.max(1, completed - 2), Math.max(1, completed - 1), completed]}
        />
        <StatSparkCard
          label="In progress"
          value={inProgress}
          percent={(inProgress / activityMax) * 100}
          color={CHART_COLORS[1]}
          icon={PlayCircle}
          sparkline={[inProgress, Math.max(0, inProgress - 1), inProgress, inProgress]}
        />
        <StatSparkCard
          label={isSchool ? "Upcoming classes" : "Subjects available"}
          value={isSchool ? upcoming : subjects}
          percent={((isSchool ? upcoming : subjects) / activityMax) * 100}
          color={CHART_COLORS[3]}
          icon={isSchool ? Calendar : BookOpen}
        />
        <StatSparkCard
          label="Practice completed"
          value={practice}
          percent={(practice / activityMax) * 100}
          color={CHART_COLORS[2]}
          icon={PenLine}
          sparkline={scoreTrend.map((p) => p.value / 10)}
        />
      </div>

      <div className="dashboard-kpi-grid">
        <StatSparkCard
          label="Average score"
          value={data.attempts > 0 ? `${data.avg_score}%` : "—"}
          percent={data.avg_score}
          color={CHART_COLORS[0]}
          icon={Target}
          sparkline={scoreTrend.map((p) => p.value)}
        />
        <StatSparkCard
          label="Best mock test"
          value={data.best_mock_score != null ? `${data.best_mock_score}%` : "—"}
          percent={data.best_mock_score ?? 0}
          color={CHART_COLORS[5]}
          icon={Trophy}
        />
      </div>

      <div className="dashboard-analytics-grid">
        <AnalyticsCard title="Learning mix" subtitle="Completed vs in-progress lectures">
          <DonutChart
            centerLabel="Lectures"
            centerValue={learningTotal}
            segments={[
              { label: "Completed", value: completed, color: CHART_COLORS[4] },
              { label: "In progress", value: inProgress, color: CHART_COLORS[1] },
            ]}
          />
        </AnalyticsCard>

        <AnalyticsCard title="Score trajectory" subtitle="Recent practice results over time">
          <AreaChart
            points={
              scoreTrend.length
                ? scoreTrend
                : [
                    { label: "Start", value: 0 },
                    { label: "Now", value: data.avg_score || 0 },
                  ]
            }
            suffix="%"
            color={CHART_COLORS[0]}
            emptyMessage="Submit a practice paper to unlock your score trend."
          />
        </AnalyticsCard>

        <AnalyticsCard
          title="Improvement focus"
          subtitle="Weak areas and study suggestions from graded papers"
          className="lg:col-span-2"
        >
          {data.improvement &&
          (data.improvement.top_weak_areas.length ||
            data.improvement.latest_suggestions.length ||
            data.improvement.score_delta != null) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Score change</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {data.improvement.score_delta == null
                    ? "—"
                    : `${data.improvement.score_delta > 0 ? "+" : ""}${data.improvement.score_delta}%`}
                </p>
                <p className="mt-1 text-xs text-slate-500">First → latest recent attempt</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Top weak areas</p>
                {data.improvement.top_weak_areas.length === 0 ? (
                  <p className="text-sm text-slate-500">No weak topics flagged yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-slate-300">
                    {data.improvement.top_weak_areas.map((item) => (
                      <li key={item.topic}>
                        • {item.topic}
                        <span className="text-slate-500"> ×{item.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Latest suggestions</p>
                {data.improvement.latest_suggestions.length === 0 ? (
                  <p className="text-sm text-slate-500">Suggestions appear after written papers are graded.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-slate-300">
                    {data.improvement.latest_suggestions.map((tip) => (
                      <li key={tip}>• {tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Complete graded written practice to unlock improvement tips and weak-topic tracking.
            </p>
          )}
        </AnalyticsCard>

        <AnalyticsCard title="Activity overview" subtitle="Learning metrics at a glance">
          <ColumnChart
            items={[
              { label: "Done", value: completed, color: CHART_COLORS[4] },
              { label: "Active", value: inProgress, color: CHART_COLORS[1] },
              {
                label: isSchool ? "Upcoming" : "Subjects",
                value: isSchool ? upcoming : subjects,
                color: CHART_COLORS[3],
              },
              { label: "Practice", value: practice, color: CHART_COLORS[2] },
            ]}
          />
        </AnalyticsCard>

        <AnalyticsCard title="Exam profile" subtitle="Strength across assessment types">
          {examRadar.length >= 3 ? (
            <RadarChart axes={examRadar} />
          ) : (
            <div className="analytics-radial-grid grid gap-4 py-2">
              <RadialProgress value={data.avg_score} label="Average" color={CHART_COLORS[0]} size={96} />
              <RadialProgress
                value={data.best_mock_score ?? 0}
                label="Best mock"
                color={CHART_COLORS[5]}
                size={96}
              />
              <RadialProgress value={completionRate} label="Lectures" color={CHART_COLORS[4]} size={96} />
            </div>
          )}
        </AnalyticsCard>

        {subjectHeat.length > 0 ? (
          <AnalyticsCard
            title="Subject intensity"
            subtitle="Completed · available · relative progress"
            className="lg:col-span-2"
          >
            <HeatmapMatrix rows={subjectHeat} />
          </AnalyticsCard>
        ) : null}
      </div>

      <AnalyticsCard title="Recent practice results" subtitle="Your latest submitted exams">
        {data.recent_attempts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No submitted practice results yet. Try a chapter quiz or mock test.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.06] bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Exam</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.recent_attempts.map((attempt) => (
                  <tr key={attempt.id} className="text-slate-300">
                    <td className="px-4 py-3 font-medium text-slate-100">{attempt.title}</td>
                    <td className="px-4 py-3">{attempt.subject}</td>
                    <td className="px-4 py-3">{attempt.label}</td>
                    <td className="px-4 py-3">
                      {attempt.score != null && attempt.total_questions != null
                        ? `${attempt.score}/${attempt.total_questions} (${attempt.percent}%)`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {attempt.submitted_at
                        ? new Date(attempt.submitted_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AnalyticsCard>
    </div>
  );
}
