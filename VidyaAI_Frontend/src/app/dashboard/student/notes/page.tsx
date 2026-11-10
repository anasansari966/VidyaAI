"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import { BookOpen, ChevronRight, GraduationCap } from "lucide-react";

type SubjectCard = {
  subject: string;
  class_grade: number;
  board: string;
  chapter_count: number;
  ready_count: number;
  generating_count: number;
  topic_count: number;
};

function subjectTheme(subject: string) {
  const key = subject.trim().toLowerCase();
  if (key.includes("math")) {
    return {
      ring: "hover:ring-indigo-400/40",
      bg: "from-indigo-500/20 via-indigo-500/5 to-slate-900/40",
      badge: "bg-indigo-500/20 text-indigo-100",
      icon: "text-indigo-300",
    };
  }
  if (key.includes("science") || key.includes("physics") || key.includes("chemistry") || key.includes("biology")) {
    return {
      ring: "hover:ring-emerald-400/40",
      bg: "from-emerald-500/20 via-emerald-500/5 to-slate-900/40",
      badge: "bg-emerald-500/20 text-emerald-100",
      icon: "text-emerald-300",
    };
  }
  if (key.includes("english") || key.includes("hindi")) {
    return {
      ring: "hover:ring-rose-400/40",
      bg: "from-rose-500/20 via-rose-500/5 to-slate-900/40",
      badge: "bg-rose-500/20 text-rose-100",
      icon: "text-rose-300",
    };
  }
  if (key.includes("social") || key.includes("history") || key.includes("geo")) {
    return {
      ring: "hover:ring-amber-400/40",
      bg: "from-amber-500/20 via-amber-500/5 to-slate-900/40",
      badge: "bg-amber-500/20 text-amber-100",
      icon: "text-amber-300",
    };
  }
  return {
    ring: "hover:ring-violet-400/40",
    bg: "from-violet-500/20 via-violet-500/5 to-slate-900/40",
    badge: "bg-violet-500/20 text-violet-100",
    icon: "text-violet-300",
  };
}

export default function StudentNotesPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .notesSubjects()
        .then((data) => {
          if (!cancelled) setSubjects(data);
        })
        .catch(console.error)
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const timer = window.setInterval(() => {
      if (subjects.some((s) => s.generating_count > 0)) load();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardShell title="Notes">
      <p className="mb-4 text-sm text-slate-400">
        Pick a subject card — each has detailed chapter notes with examples and solved questions from your uploaded books.
      </p>

      {loading ? (
        <FriendlyLoader message="Loading subject notes…" />
      ) : !subjects.length ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p>No subject notes yet. Once chapters are ready, detailed CBSE notes appear here by subject.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((item) => {
            const theme = subjectTheme(item.subject);
            return (
              <button
                key={`${item.subject}-${item.class_grade}-${item.board}`}
                type="button"
                onClick={() =>
                  router.push(`/dashboard/student/notes/subject/${encodeURIComponent(item.subject)}`)
                }
                className={`glass group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 text-left ring-1 ring-transparent transition hover:-translate-y-0.5 hover:border-white/20 ${theme.ring}`}
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80 ${theme.bg}`} />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`rounded-xl bg-black/20 p-2.5 ${theme.icon}`}>
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${theme.badge}`}>
                      {item.board}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">{item.subject}</h3>
                  <p className="mt-1 text-sm text-slate-300">Class {item.class_grade}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-black/25 px-3 py-2">
                      <p className="text-slate-400">Chapters</p>
                      <p className="mt-0.5 font-semibold text-white">{item.chapter_count}</p>
                    </div>
                    <div className="rounded-lg bg-black/25 px-3 py-2">
                      <p className="text-slate-400">Topics</p>
                      <p className="mt-0.5 font-semibold text-white">{item.topic_count || "—"}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {item.generating_count > 0
                        ? `${item.generating_count} generating…`
                        : `${item.ready_count} ready`}
                    </span>
                    <span className="inline-flex items-center gap-1 text-indigo-200">
                      Open subject <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-500">
        Live class uses separate synced transcript notes in the classroom panel.{" "}
        <Link href="/dashboard/student/recordings" className="text-indigo-300 hover:underline">
          Browse recordings
        </Link>
      </p>
    </DashboardShell>
  );
}
