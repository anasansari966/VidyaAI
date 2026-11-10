"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import { BookOpen, ChevronLeft, ChevronRight, FileText } from "lucide-react";

type TopicSummary = {
  topic_index: number;
  title: string;
  preview?: string;
  has_examples?: boolean;
  has_questions?: boolean;
  key_point_count?: number;
};

type ChapterCard = {
  chapter_id: number;
  title: string;
  chapter_title: string;
  subject: string;
  class_grade: number;
  board: string;
  topic_count: number;
  status: string;
  lecture_id?: number | null;
  topics?: TopicSummary[];
};

export default function SubjectNotesPage() {
  const params = useParams();
  const router = useRouter();
  const subject = decodeURIComponent(String(params.subject || ""));
  const [chapters, setChapters] = useState<ChapterCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!subject) {
      setError("Invalid subject.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .notesBySubject(subject)
        .then((data) => {
          if (!cancelled) {
            setChapters(data);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not load chapters.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const timer = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [subject]);

  const meta = chapters[0];
  const totalTopics = chapters.reduce((sum, c) => sum + (c.topic_count || 0), 0);

  return (
    <DashboardShell title="Notes">
      <Link
        href="/dashboard/student/notes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"
      >
        <ChevronLeft className="h-4 w-4" />
        All subjects
      </Link>

      {loading ? (
        <FriendlyLoader message={`Loading ${subject} notes…`} />
      ) : error ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">{error}</div>
      ) : (
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs text-indigo-300">
              {meta?.board || "CBSE"} · Class {meta?.class_grade ?? "—"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">{subject}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {totalTopics > 0
                ? `${totalTopics} topics across ${chapters.length} chapters — click any topic to open its notes.`
                : "Detailed chapter notes with worked examples and solved questions."}
            </p>
          </div>

          {chapters.map((item) => (
            <section key={item.chapter_id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 shrink-0 text-indigo-300" />
                    <h2 className="text-lg font-semibold text-white">{item.chapter_title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    {item.status === "generating"
                      ? "Generating topics…"
                      : `${item.topic_count} topics ready`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/student/notes/chapter/${item.chapter_id}`)}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-indigo-200 hover:bg-white/10"
                >
                  All topics <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {item.status === "generating" ? (
                <p className="mt-4 text-sm text-amber-200/90">Topics will appear here when generation finishes.</p>
              ) : !item.topics?.length ? (
                <p className="mt-4 text-sm text-slate-500">No topics yet for this chapter.</p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {item.topics.map((topic) => (
                    <button
                      key={`${item.chapter_id}-${topic.topic_index}`}
                      type="button"
                      onClick={() =>
                        router.push(
                          `/dashboard/student/notes/chapter/${item.chapter_id}/topic/${topic.topic_index}`
                        )
                      }
                      className="group rounded-xl border border-white/10 bg-black/20 p-3.5 text-left transition hover:border-indigo-400/40 hover:bg-indigo-500/10"
                    >
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-wide text-slate-500">
                            Topic {topic.topic_index + 1}
                          </p>
                          <h3 className="mt-0.5 font-medium text-white group-hover:text-indigo-100">
                            {topic.title}
                          </h3>
                          {topic.preview && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{topic.preview}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                            {topic.has_examples && (
                              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-indigo-200">
                                Examples
                              </span>
                            )}
                            {topic.has_questions && (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                                Q&A
                              </span>
                            )}
                            {(topic.key_point_count || 0) > 0 && (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                                {topic.key_point_count} key points
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-300" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
