"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Building2,
  Crown,
  Mail,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SuperAdminAnalytics } from "@/components/analytics/SuperAdminAnalytics";
import { api } from "@/lib/api";
import type { PlatformOverview } from "@/types";

const quickLinks = [
  { href: "/dashboard/super-admin/schools", label: "Manage schools", desc: "Create, edit & assign admins", icon: Building2 },
  { href: "/dashboard/super-admin/users", label: "All users", desc: "Suspend admins & students platform-wide", icon: Users },
  { href: "/dashboard/super-admin/leads", label: "Leads", desc: "Demo requests and individual student signups", icon: Mail },
  { href: "/dashboard/admin/books", label: "Books & lectures", desc: "Upload & generate for any school", icon: BookOpen },
  { href: "/dashboard/admin/access", label: "Access control", desc: "Suspend or stop service per student", icon: Shield },
];

export default function SuperAdminPage() {
  const [stats, setStats] = useState<PlatformOverview | null>(null);

  useEffect(() => {
    api.platformOverview().then(setStats).catch(console.error);
  }, []);

  return (
    <DashboardShell title="Command Center">
      <div className="mb-6 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/20">
            <Crown className="h-6 w-6 text-violet-200" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Platform God mode</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Full control over every school, user, book, schedule, demo lead, and student lead on VidyaAI.
              Analytics below update live from your Supabase database.
            </p>
          </div>
        </div>
      </div>

      <SuperAdminAnalytics stats={stats} />

      <div className="mt-8 mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-300" aria-hidden />
        <h3 className="text-lg font-semibold">Quick actions</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="analytics-card group transition hover:border-indigo-400/30 hover:bg-white/[0.03]"
            >
              <Icon className="mb-3 h-5 w-5 text-indigo-300" aria-hidden />
              <p className="font-semibold text-white group-hover:text-indigo-100">{item.label}</p>
              <p className="mt-1 text-sm text-slate-400">{item.desc}</p>
            </Link>
          );
        })}
      </div>
    </DashboardShell>
  );
}
