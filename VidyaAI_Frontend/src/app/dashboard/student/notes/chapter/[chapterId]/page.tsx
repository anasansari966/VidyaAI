"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

type TopicSummary = {
  topic_index: number;
  title: string;
  preview?: string;
  has_examples?: boolean;
  has_questions?: boolean;
  key_point_count?: number;
};

type ChapterTopics = {
  chapter_id: number;
  chapter_title: string;
  subject: string;
  class_grade: number;
  board: string;
  status: string;
  overview?: string;
  topics: TopicSummary[];
  lecture_id?: number | null;
};

export default function StudentChapterNotesPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = Number(params.chapterId);
  const [detail, setDetail] = useState<ChapterTopics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chapterId || Number.isNaN(chapterId)) {
      setError("Invalid notes link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .notesChapterTopics(chapterId)
        .then((data) => {
          if (!cancelled) {
            setDetail(data);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not load topics.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const timer = window.setInterval(load, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [chapterId]);

  const subjectHref = detail?.subject
    ? `/dashboard/student/notes/subject/${encodeURIComponent(detail.subject)}`
    : "/dashboard/student/notes";

  return (
    <DashboardShell title="Notes">
      <Link
        href={subjectHref}
        className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {detail?.subject || "subject"}
      </Link>

      {loading ? (
        <FriendlyLoader message="Loading topics…" />
      ) : error || !detail ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">{error || "Notes not found."}</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs text-indigo-300">
              {detail.board} · {detail.subject} · Class {detail.class_grade}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">{detail.chapter_title}</h1>
            {detail.overview && (
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{detail.overview}</p>
            )}
            <p className="mt-2 text-sm text-slate-400">
              {detail.status === "generating"
                ? "Generating topic notes…"
                : `${detail.topics.length} topics — open any topic to study individually.`}
            </p>
            {detail.lecture_id ? (
              <Link
                href={`/dashboard/student/lectures/classroom?lecture=${detail.lecture_id}&replay=1`}
                className="mt-3 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
              >
                Open lecture with synced notes
              </Link>
            ) : null}
          </div>

          {detail.status === "generating" ? (
            <div className="glass rounded-2xl p-8 text-center text-amber-200/90">
              Topics are being prepared from your uploaded content. This page refreshes automatically.
            </div>
          ) : (
            <div className="space-y-2">
              {detail.topics.map((topic) => (
                <button
                  key={topic.topic_index}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/dashboard/student/notes/chapter/${detail.chapter_id}/topic/${topic.topic_index}`
                    )
                  }
                  className="glass group flex w-full items-start gap-3 rounded-2xl p-4 text-left transition hover:border-indigo-400/30 hover:bg-indigo-500/[0.06]"
                >
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Topic {topic.topic_index + 1} of {detail.topics.length}
                    </p>
                    <h2 className="mt-0.5 font-semibold text-white group-hover:text-indigo-100">
                      {topic.title}
                    </h2>
                    {topic.preview && (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-400">{topic.preview}</p>
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
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
