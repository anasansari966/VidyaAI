"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { api } from "@/lib/api";
import { ChevronLeft } from "lucide-react";

type NoteDetail = {
  lecture_id: number;
  chapter_id: number;
  title: string;
  chapter_title: string;
  subject: string;
  class_grade: number;
  pages: Array<{
    page_number: number;
    title: string;
    summary: string;
    transcript?: string;
    lines?: Array<{ text: string; start_seconds: number; end_seconds: number; duration_seconds: number }>;
    sections: Array<{ heading: string; body: string; bullets?: string[] }>;
    key_points: string[];
    practice?: Array<{ question: string; hint?: string; answer_outline?: string }>;
    start_seconds: number;
    duration_seconds: number;
  }>;
};

export default function StudentNoteDetailPage() {
  const params = useParams();
  const lectureId = Number(params.lectureId);
  const [detail, setDetail] = useState<NoteDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lectureId || Number.isNaN(lectureId)) {
      setError("Invalid notes link.");
      setLoading(false);
      return;
    }
    api
      .notesDetail(lectureId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load notes."))
      .finally(() => setLoading(false));
  }, [lectureId]);

  return (
    <DashboardShell title="Notes">
      <Link
        href="/dashboard/student/notes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-300 hover:text-indigo-200"
      >
        <ChevronLeft className="h-4 w-4" />
        All notes
      </Link>

      {loading ? (
        <FriendlyLoader message="Opening notes…" />
      ) : error || !detail ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">{error || "Notes not found."}</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs text-indigo-300">
              {detail.subject} · Class {detail.class_grade}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">{detail.title}</h1>
            <p className="mt-1 text-sm text-slate-400">{detail.chapter_title}</p>
            <Link
              href={`/dashboard/student/lectures/classroom?lecture=${detail.lecture_id}&replay=1`}
              className="mt-3 inline-flex rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Replay with synced notes
            </Link>
          </div>

          {detail.pages.map((page) => (
            <article key={page.page_number} className="glass rounded-2xl p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Page {page.page_number}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">{page.title}</h2>
              {page.summary && <p className="mt-2 text-sm leading-relaxed text-slate-300">{page.summary}</p>}

              {!!page.lines?.length && (
                <div className="mt-4 rounded-xl border border-sky-400/25 bg-sky-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-200/90">Transcript</p>
                  <div className="mt-2 space-y-2">
                    {page.lines.map((line, idx) => (
                      <p key={idx} className="text-sm leading-relaxed text-slate-200">
                        {line.text}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {page.sections.map((section, idx) => {
                  if (section.heading.trim().toLowerCase() === "transcript" && page.lines?.length) {
                    return null;
                  }
                  return (
                  <div key={`${page.page_number}-${idx}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200/90">{section.heading}</p>
                    {section.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{section.body}</p>
                    )}
                    {!!section.bullets?.length && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                        {section.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  );
                })}
              </div>

              {!!page.key_points?.length && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">Key points</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
                    {page.key_points.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!page.practice?.length && (
                <div className="mt-4 space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">Practice</p>
                  {page.practice.map((item, idx) => (
                    <div key={idx} className="rounded-lg bg-black/20 p-3 text-sm text-slate-200">
                      <p className="font-medium text-emerald-100">
                        Q{idx + 1}. {item.question}
                      </p>
                      {item.hint && <p className="mt-1 text-xs text-slate-400">Hint: {item.hint}</p>}
                      {item.answer_outline && (
                        <p className="mt-1 text-xs text-slate-400">Answer path: {item.answer_outline}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
