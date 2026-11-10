"use client";

import {
  AnalyticsCard,
  BarChart,
  CHART_COLORS,
  ColumnChart,
  DonutChart,
  StatSparkCard,
} from "@/components/analytics/charts";
import type { PlatformOverview } from "@/types";
import { BookOpen, Building2, GraduationCap, Mail, Shield, Users } from "lucide-react";

export function SuperAdminAnalytics({ stats }: { stats: PlatformOverview | null }) {
  if (!stats) {
    return (
      <div className="analytics-card">
        <p className="text-sm text-slate-500">Loading platform analytics…</p>
      </div>
    );
  }

  const userTotal = stats.admins + stats.students || 1;
  const contentMax = Math.max(stats.books, stats.chapters, stats.lectures_ready, 1);
  const engagementMax = Math.max(
    stats.practice_submissions,
    stats.schedules,
    stats.demo_leads,
    stats.student_leads || 0,
    1
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatSparkCard
          label="Schools on platform"
          value={stats.schools}
          percent={(stats.schools / Math.max(stats.schools, 5)) * 100}
          color={CHART_COLORS[0]}
          icon={Building2}
        />
        <StatSparkCard
          label="Total students"
          value={stats.students}
          percent={(stats.students / userTotal) * 100}
          color={CHART_COLORS[1]}
          icon={GraduationCap}
        />
        <StatSparkCard
          label="New student leads"
          value={stats.student_leads_new ?? 0}
          percent={((stats.student_leads_new ?? 0) / Math.max(stats.student_leads || 1, 1)) * 100}
          color={CHART_COLORS[4]}
          icon={GraduationCap}
        />
        <StatSparkCard
          label="New demo leads"
          value={stats.demo_leads_new}
          percent={(stats.demo_leads_new / Math.max(stats.demo_leads, 1)) * 100}
          color={CHART_COLORS[5]}
          icon={Mail}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AnalyticsCard title="User composition" subtitle="Admins, learners & suspended accounts">
          <DonutChart
            centerLabel="Users"
            centerValue={userTotal + stats.suspended_users}
            segments={[
              { label: "Students", value: stats.students, color: CHART_COLORS[1] },
              { label: "Admins", value: stats.admins, color: CHART_COLORS[0] },
              { label: "Suspended", value: stats.suspended_users, color: CHART_COLORS[5] },
            ]}
          />
        </AnalyticsCard>

        <AnalyticsCard title="Content pipeline" subtitle="Books, chapters & ready lectures">
          <ColumnChart
            items={[
              { label: "Books", value: stats.books, color: CHART_COLORS[2] },
              { label: "Chapters", value: stats.chapters, color: CHART_COLORS[3] },
              { label: "Lectures", value: stats.lectures_ready, color: CHART_COLORS[4] },
            ]}
          />
        </AnalyticsCard>

        <AnalyticsCard title="Platform engagement" subtitle="Schedules, practice & inbound leads">
          <BarChart
            items={[
              { label: "Practice submissions", value: stats.practice_submissions },
              { label: "Scheduled classes", value: stats.schedules },
              { label: "Demo leads", value: stats.demo_leads },
              { label: "Student leads", value: stats.student_leads || 0 },
              { label: "Practice templates", value: stats.practice_templates },
            ]}
            valueKey="value"
            labelKey="label"
          />
        </AnalyticsCard>

        <AnalyticsCard title="Health indicators" subtitle="Relative load across key metrics">
          <BarChart
            items={[
              { label: "Students per school", value: stats.schools ? Math.round(stats.students / stats.schools) : 0 },
              { label: "Books uploaded", value: stats.books },
              { label: "Lectures ready", value: stats.lectures_ready },
              { label: "Suspended users", value: stats.suspended_users },
            ]}
            valueKey="value"
            labelKey="label"
          />
        </AnalyticsCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Admins", value: stats.admins, icon: Shield, color: CHART_COLORS[0] },
          { label: "Books", value: stats.books, icon: BookOpen, color: CHART_COLORS[2] },
          { label: "All users", value: userTotal, icon: Users, color: CHART_COLORS[1] },
          {
            label: "Content score",
            value: `${Math.round(((stats.lectures_ready + stats.chapters) / contentMax) * 50)}%`,
            icon: BookOpen,
            color: CHART_COLORS[4],
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="analytics-stat-card flex items-center gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${item.color}18`, color: item.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="text-sm text-slate-400">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
