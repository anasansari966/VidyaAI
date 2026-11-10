"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import type { Recording } from "@/types";
import { BookOpen, ChevronLeft, History, PlayCircle } from "lucide-react";

function formatDate(iso: string | null) {
  if (!iso) return "Watch anytime";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StudentRecordingsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  useEffect(() => {
    api
      .recordings()
      .then(setRecordings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(() => {
    const map = new Map<string, Recording[]>();
    for (const item of recordings) {
      const list = map.get(item.subject) ?? [];
      list.push(item);
      map.set(item.subject, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [recordings]);

  const subjectRecordings = selectedSubject
    ? subjects.find(([name]) => name === selectedSubject)?.[1] ?? []
    : [];

  return (
    <DashboardShell title="Past Classes">
      <p className="mb-4 text-sm text-slate-400">
        Pick a subject to see your saved class recordings.
      </p>

      {loading ? (
        <FriendlyLoader message="Finding your past classes…" />
      ) : !recordings.length ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">
          <History className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p>No saved classes yet. Join a live session or ask your teacher to schedule one.</p>
        </div>
      ) : !selectedSubject ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map(([subject, items]) => (
            <button
              key={subject}
              type="button"
              onClick={() => setSelectedSubject(subject)}
              className="glass group rounded-2xl p-5 text-left transition hover:border-indigo-400/30 hover:bg-indigo-500/[0.06]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-500/10">
                  <BookOpen className="h-5 w-5 text-indigo-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white group-hover:text-indigo-100">{subject}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {items.length} saved {items.length === 1 ? "class" : "classes"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setSelectedSubject(null)}
            className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"
          >
            <ChevronLeft className="h-4 w-4" />
            All subjects
          </button>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjectRecordings.map((item) => (
              <article key={item.lecture_id} className="glass flex flex-col rounded-2xl p-5">
                <p className="text-xs text-indigo-300">Class {item.class_grade}</p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Lesson {item.chapter_number}: {item.chapter_title}
                </p>
                <p className="mt-2 text-xs text-slate-500">{formatDate(item.completed_at)}</p>
                {item.last_position_seconds > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    You left off at {Math.floor(item.last_position_seconds / 60)} min
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/student/lectures/classroom?lecture=${item.lecture_id}&replay=1`
                    )
                  }
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  <PlayCircle className="h-4 w-4" />
                  Watch again
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
