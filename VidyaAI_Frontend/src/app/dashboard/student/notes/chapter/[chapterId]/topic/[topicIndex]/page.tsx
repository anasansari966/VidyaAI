"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

type QaItem = { question: string; answer?: string; steps?: string; source?: string };
type WorkedExample = { title?: string; problem?: string; steps?: string; solution?: string };

type TopicDetail = {
  chapter_id: number;
  chapter_title: string;
  subject: string;
  class_grade: number;
  board: string;
  topic_index: number;
  topic_count: number;
  prev_index?: number | null;
  next_index?: number | null;
  topic: {
    title: string;
    theory: string;
    formulas?: string[];
    examples?: string[];
    worked_examples?: WorkedExample[];
    key_points?: string[];
    questions_with_answers?: QaItem[];
    practice?: Array<{ question: string; hint?: string; answer?: string; answer_outline?: string }>;
    exam_tips?: string[];
  };
};

function QaBlock({ items, title }: { items: QaItem[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">{title}</p>
      {items.map((item, idx) => (
        <div key={idx} className="rounded-lg bg-black/25 p-3 text-sm">
          <p className="font-medium text-emerald-100">
            Q{idx + 1}. {item.question}
          </p>
          {item.steps && (
            <p className="mt-2 whitespace-pre-wrap text-slate-300">
              <span className="text-xs font-semibold uppercase text-slate-500">Solution steps: </span>
              {item.steps}
            </p>
          )}
          {item.answer && (
            <p className="mt-2 whitespace-pre-wrap text-emerald-50/95">
              <span className="text-xs font-semibold uppercase text-emerald-300/80">Answer: </span>
              {item.answer}
            </p>
          )}
          {item.source && <p className="mt-1 text-[11px] text-slate-500">Source: {item.source}</p>}
        </div>
      ))}
    </div>
  );
}

function WorkedExamplesBlock({ items }: { items: WorkedExample[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3 rounded-xl border border-indigo-400/25 bg-indigo-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200/90">Worked examples</p>
      {items.map((ex, idx) => (
        <div key={idx} className="rounded-lg bg-black/25 p-3 text-sm text-slate-200">
          <p className="font-medium text-indigo-100">{ex.title || `Example ${idx + 1}`}</p>
          {ex.problem && (
            <p className="mt-2 whitespace-pre-wrap">
              <span className="text-xs font-semibold uppercase text-slate-500">Problem: </span>
              {ex.problem}
            </p>
          )}
          {ex.steps && (
            <p className="mt-2 whitespace-pre-wrap">
              <span className="text-xs font-semibold uppercase text-slate-500">Steps: </span>
              {ex.steps}
            </p>
          )}
          {ex.solution && (
            <p className="mt-2 whitespace-pre-wrap text-indigo-50/95">
              <span className="text-xs font-semibold uppercase text-indigo-300/80">Answer: </span>
              {ex.solution}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function StudentTopicNotesPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = Number(params.chapterId);
  const topicIndex = Number(params.topicIndex);
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chapterId || Number.isNaN(chapterId) || Number.isNaN(topicIndex)) {
      setError("Invalid topic link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .notesTopicDetail(chapterId, topicIndex)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load topic notes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, topicIndex]);

  const topic = detail?.topic;
  const goTopic = (index: number) => {
    router.push(`/dashboard/student/notes/chapter/${chapterId}/topic/${index}`);
  };

  return (
    <DashboardShell title="Notes">
      <Link
        href={`/dashboard/student/notes/chapter/${chapterId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"
      >
        <ChevronLeft className="h-4 w-4" />
        All topics
      </Link>

      {loading ? (
        <FriendlyLoader message="Opening topic notes…" />
      ) : error || !detail || !topic ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">{error || "Topic not found."}</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs text-indigo-300">
              {detail.board} · {detail.subject} · Class {detail.class_grade}
            </p>
            <p className="mt-1 text-sm text-slate-400">{detail.chapter_title}</p>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
              Topic {detail.topic_index + 1} of {detail.topic_count}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">{topic.title}</h1>
          </div>

          <article className="glass space-y-4 rounded-2xl p-5">
            {topic.theory && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{topic.theory}</p>
            )}

            {!!topic.formulas?.length && (
              <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90">Formulas</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                  {topic.formulas.map((f, idx) => (
                    <li key={idx}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <WorkedExamplesBlock items={topic.worked_examples || []} />

            {!!topic.key_points?.length && (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">Key points</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
                  {topic.key_points.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            <QaBlock items={topic.questions_with_answers || []} title="Questions & answers" />

            {!!topic.practice?.length && (
              <div className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">Practice</p>
                {topic.practice.map((item, idx) => (
                  <div key={idx} className="rounded-lg bg-black/20 p-3 text-sm text-slate-200">
                    <p className="font-medium text-emerald-100">
                      Q{idx + 1}. {item.question}
                    </p>
                    {item.hint && <p className="mt-1 text-xs text-slate-400">Hint: {item.hint}</p>}
                    {item.answer && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-emerald-50/95">
                        <span className="text-xs font-semibold uppercase text-emerald-300/80">Answer: </span>
                        {item.answer}
                      </p>
                    )}
                    {item.answer_outline && !item.answer && (
                      <p className="mt-1 text-xs text-slate-400">Answer path: {item.answer_outline}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!!topic.exam_tips?.length && (
              <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-200/90">Exam tips</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">
                  {topic.exam_tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={detail.prev_index == null}
              onClick={() => detail.prev_index != null && goTopic(detail.prev_index)}
              className="inline-flex items-center gap-1 rounded-xl bg-white/5 px-4 py-2 text-sm text-slate-200 disabled:opacity-40 hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous topic
            </button>
            <button
              type="button"
              disabled={detail.next_index == null}
              onClick={() => detail.next_index != null && goTopic(detail.next_index)}
              className="inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-indigo-400"
            >
              Next topic
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
