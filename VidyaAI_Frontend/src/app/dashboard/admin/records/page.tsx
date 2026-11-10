"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import { ChevronRight, FileBarChart2, GraduationCap, Trophy, Users } from "lucide-react";

type ClassCard = {
  class_grade: number | null;
  key: string;
  label: string;
  student_count: number;
  attempted_count: number;
  class_avg: number;
  top_student: string | null;
  top_score: number | null;
};

export default function AdminStudentRecordsPage() {
  const [classes, setClasses] = useState<ClassCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .adminRecordClasses()
      .then(setClasses)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load classes"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell title="Student Records">
      <section className="mb-6 rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-white/[0.02] to-transparent px-5 py-5">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/90">
          <FileBarChart2 className="h-3.5 w-3.5" aria-hidden />
          Class-wise records
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Select a class</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Open a class to view only that class&apos;s students, top performers, and bulk PDF records.
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-slate-400">Loading classes…</p>
      ) : classes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          No students found in your domain yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((item) => (
            <Link
              key={item.key}
              href={`/dashboard/admin/records/class/${item.key}`}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-sky-400/30 hover:bg-sky-500/[0.06]"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-200">
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-sky-200" />
              </div>
              <h3 className="text-lg font-semibold text-white">{item.label}</h3>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-sky-300" />
                  {item.student_count} students
                </span>
                <span>
                  Avg {item.attempted_count ? `${item.class_avg}%` : "—"}
                </span>
              </div>
              {item.top_student && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-100/90">
                  <Trophy className="h-3.5 w-3.5 text-amber-300" />
                  Top: {item.top_student}
                  {item.top_score != null ? ` · ${item.top_score}%` : ""}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </DashboardShell>
  );
}
