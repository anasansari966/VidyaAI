"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { clearStashedPracticePaper, readStashedPracticePaper } from "@/lib/studentFocusWindow";
import type { PracticeExam, PracticePaper } from "@/types";
import { CheckCircle2, Loader2, QrCode, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";

function qrImageUrl(uploadUrl: string): string {
  const absolute =
    typeof window !== "undefined" ? new URL(uploadUrl, window.location.origin).toString() : uploadUrl;
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(absolute)}`;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function ExamPaperBody({ exam }: { exam: PracticeExam }) {
  const meta = exam.exam_meta;
  return (
    <div className="space-y-6 font-serif text-slate-900">
      <header className="border-b-2 border-slate-800 pb-4 text-center">
        <p className="text-xs uppercase tracking-widest text-slate-600">
          {meta?.board_style ?? "CBSE / NCERT Style Examination"}
        </p>
        <h1 className="mt-2 text-xl font-bold uppercase">{meta?.subject ?? "Subject"}</h1>
        <p className="text-sm">
          Class {meta?.class_grade ?? "—"} ·{" "}
          {(meta as { exam_label?: string })?.exam_label ?? meta?.plan_type?.replace(/_/g, " ") ?? "Practice Paper"}
        </p>
        {(meta as { syllabus_note?: string })?.syllabus_note && (
          <p className="mt-1 text-xs text-slate-600">{(meta as { syllabus_note?: string }).syllabus_note}</p>
        )}
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs">
          <span>Time: {meta?.duration_minutes ?? 60} minutes</span>
          <span>Maximum Marks: {meta?.total_marks ?? "—"}</span>
        </div>
      </header>

      {meta?.chapters && meta.chapters.length > 0 && (
        <section className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
          <p className="font-semibold">Syllabus covered:</p>
          <ul className="mt-1 list-inside list-disc text-slate-700">
            {meta.chapters.map((ch) => (
              <li key={ch}>{ch}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-slate-300 p-4 text-sm">
        <p className="mb-2 font-semibold uppercase">General Instructions</p>
        <ol className="list-inside list-decimal space-y-1 text-slate-700">
          {(meta?.instructions ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
          {(meta?.general_instructions ?? []).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      {exam.sections.map((section) => (
        <section key={section.id} className="space-y-4">
          <h2 className="border-b border-slate-400 pb-1 text-sm font-bold uppercase">{section.title}</h2>
          {section.questions.map((q) => (
            <div key={q.number} className="text-sm leading-relaxed">
              <p className="font-medium">
                <span className="mr-2">{q.number}.</span>
                {q.question}
                <span className="ml-2 text-slate-600">
                  [{q.marks} mark{q.marks === 1 ? "" : "s"}]
                </span>
              </p>
              {q.options && q.options.length > 0 && (
                <ul className="mt-2 ml-6 space-y-1 text-slate-700">
                  {q.options.map((opt) => (
                    <li key={opt}>{opt}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

type ParentNotifyResult = {
  sent: number;
  phones: string[];
  suggestions: string[];
  error?: string | null;
};

function McqQuizBody({
  paper,
  onSubmitted,
}: {
  paper: PracticePaper;
  onSubmitted: (score: number, total: number, parentNotify: ParentNotifyResult | null) => void;
}) {
  const questions = paper.questions ?? [];
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload: Record<number, string> = {};
      Object.entries(answers).forEach(([k, v]) => {
        payload[Number(k)] = v;
      });
      const result = await api.submitPractice(paper.id, payload);
      onSubmitted(result.score, result.total, result.parent_notify ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass space-y-5 rounded-2xl p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">{paper.title}</h2>
      <p className="text-sm text-slate-400">{paper.subject} · Quick quiz</p>
      {questions.map((q, index) => (
        <fieldset key={index} className="rounded-xl border border-white/10 p-4">
          <legend className="px-1 text-sm font-medium text-slate-200">
            {index + 1}. {q.question}
          </legend>
          <div className="mt-3 space-y-2">
            {(q.options ?? []).map((opt) => {
              const letter = opt.match(/^\(([a-d])\)/i)?.[1]?.toLowerCase() ?? opt.slice(0, 1).toLowerCase();
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    answers[index] === letter
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-white/10 hover:bg-white/[0.03]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${index}`}
                    checked={answers[index] === letter}
                    onChange={() => setAnswers((prev) => ({ ...prev, [index]: letter }))}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        disabled={submitting || Object.keys(answers).length < questions.length}
        onClick={() => void handleSubmit()}
      >
        {submitting ? "Checking answers…" : "Submit quiz"}
      </Button>
    </div>
  );
}

export function PracticeSessionView({ paperId }: { paperId: number }) {
  const [paper, setPaper] = useState<PracticePaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const autoFinishRef = useRef(false);

  const [mcqScore, setMcqScore] = useState<{ score: number; total: number } | null>(null);
  const [parentNotify, setParentNotify] = useState<ParentNotifyResult | null>(null);

  const loadPaper = useCallback(async () => {
    const stashed = readStashedPracticePaper(paperId);
    if (stashed?.exam) {
      setPaper(stashed);
      if (stashed.upload_url) setUploadUrl(stashed.upload_url);
      if (typeof stashed.remaining_seconds === "number") setRemaining(stashed.remaining_seconds);
      else if (stashed.ends_at) {
        setRemaining(Math.max(0, Math.floor((new Date(stashed.ends_at).getTime() - Date.now()) / 1000)));
      }
      setLoading(false);
      // Still refresh from API for accurate timer
    }
    try {
      const found = await api.practicePaper(paperId);
      setPaper(found);
      if (found.upload_url) setUploadUrl(found.upload_url);
      if (typeof found.remaining_seconds === "number") setRemaining(found.remaining_seconds);
      else if (found.ends_at) {
        setRemaining(Math.max(0, Math.floor((new Date(found.ends_at).getTime() - Date.now()) / 1000)));
      }
      if (found.status === "awaiting_upload" && found.upload_url) {
        setShowQr(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    void loadPaper();
  }, [loadPaper]);

  useEffect(() => {
    if (!paper || paper.status !== "evaluating") return;
    const interval = setInterval(async () => {
      try {
        const refreshed = await api.practicePaper(paperId);
        setPaper(refreshed);
        setPollStatus(refreshed.status ?? null);
        if (refreshed.status === "graded") {
          clearStashedPracticePaper();
          clearInterval(interval);
        }
      } catch {
        /* ignore poll errors */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [paper, paperId]);

  const handleFinish = useCallback(async () => {
    if (!paper || finishing) return;
    setFinishing(true);
    try {
      const result = await api.finishPractice(paper.id);
      setUploadUrl(result.upload_url);
      setShowQr(true);
      setPaper((prev) =>
        prev ? { ...prev, status: "awaiting_upload", upload_url: result.upload_url } : prev
      );
    } catch (err) {
      console.error(err);
    } finally {
      setFinishing(false);
    }
  }, [paper, finishing]);

  useEffect(() => {
    const isWritten = Boolean(paper?.exam?.sections?.length);
    if (!isWritten || remaining === null) return;
    if (paper?.status && paper.status !== "in_progress") return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paper?.exam?.sections?.length, paper?.status, remaining === null]);

  useEffect(() => {
    if (remaining !== 0) return;
    if (!paper || paper.status !== "in_progress") return;
    if (autoFinishRef.current) return;
    autoFinishRef.current = true;
    void handleFinish();
  }, [remaining, paper, handleFinish]);

  if (loading) {
    return <FriendlyLoader message="Preparing your practice…" className="min-h-[60vh]" />;
  }

  if (!paper) {
    return <p className="text-center text-slate-400">Practice paper not found.</p>;
  }

  const exam = paper.exam;
  const isWrittenExam = Boolean(exam?.sections?.length);
  const isMcqQuiz = paper.plan_type === "mcq" || (!isWrittenExam && (paper.questions?.length ?? 0) > 0);
  const graded = paper.status === "graded" || mcqScore !== null;
  const timerUrgent = remaining !== null && remaining <= 5 * 60;

  return (
    <>
      {isWrittenExam && remaining !== null && paper.status === "in_progress" && (
        <div
          className={`sticky top-0 z-40 mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
            timerUrgent
              ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
              : "border-white/10 bg-slate-950/80 text-slate-100 backdrop-blur"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4" />
            Time remaining
          </div>
          <p className="font-mono text-lg font-semibold tracking-wider">{formatCountdown(remaining)}</p>
        </div>
      )}

      <section className="mx-auto max-w-3xl">
        {isMcqQuiz && !graded ? (
          <McqQuizBody
            paper={paper}
            onSubmitted={(score, total, notify) => {
              setMcqScore({ score, total });
              setParentNotify(notify);
            }}
          />
        ) : isMcqQuiz && mcqScore ? (
          <div className="glass rounded-2xl p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
            <p className="text-lg font-semibold text-white">
              You scored {mcqScore.score} out of {mcqScore.total}
            </p>
            <p className="mt-2 text-sm text-slate-400">Great effort — keep practicing!</p>
            {parentNotify && parentNotify.suggestions.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Chapter suggestions
                </p>
                <ul className="space-y-1.5 text-sm text-slate-300">
                  {parentNotify.suggestions.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : isWrittenExam && exam ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg sm:p-8">
            <ExamPaperBody exam={exam} />
          </div>
        ) : (
          <div className="glass rounded-2xl p-5 text-slate-300">
            <p className="mb-4">This paper format is not supported in the browser yet.</p>
          </div>
        )}

        {isWrittenExam && (
          <div className="mt-6 space-y-4 text-center">
            {!graded && paper.status !== "evaluating" && paper.status !== "awaiting_upload" && (
              <>
                <p className="text-sm text-slate-400">
                  Write answers on paper. When time ends (or you finish early), scan the QR code and upload photos
                  for each question.
                </p>
                <Button type="button" disabled={finishing || showQr} onClick={() => void handleFinish()}>
                  {finishing ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Preparing upload…
                    </span>
                  ) : (
                    "Finish early & upload answers"
                  )}
                </Button>
              </>
            )}

            {paper.status === "awaiting_upload" && (
              <Button type="button" onClick={() => setShowQr(true)}>
                Show upload QR code
              </Button>
            )}

            {paper.status === "evaluating" && (
              <p className="inline-flex items-center gap-2 text-amber-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is evaluating your answers… {pollStatus ? `(${pollStatus})` : ""}
              </p>
            )}

            {graded && paper.evaluation && (
              <div className="glass rounded-2xl p-5 text-left">
                <p className="mb-2 inline-flex items-center gap-2 text-lg font-semibold text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  Result: {paper.score ?? 0}/{paper.total_marks ?? paper.total_questions ?? 0} marks
                  {typeof paper.evaluation.percent === "number" ? ` (${paper.evaluation.percent}%)` : ""}
                </p>
                {paper.evaluation.summary && (
                  <p className="mb-4 text-sm text-slate-300">{paper.evaluation.summary}</p>
                )}
                {paper.evaluation.questions && paper.evaluation.questions.length > 0 && (
                  <ul className="mb-4 space-y-2 text-sm text-slate-400">
                    {paper.evaluation.questions.map((q) => (
                      <li key={q.number} className="rounded-lg bg-white/[0.03] px-3 py-2">
                        Q{q.number}: {q.marks_awarded}/{q.max_marks} — {q.feedback}
                      </li>
                    ))}
                  </ul>
                )}
                {paper.evaluation.suggestions && paper.evaluation.suggestions.length > 0 && (
                  <div className="mb-3 rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
                      Suggestions to improve
                    </p>
                    <ul className="space-y-1.5 text-sm text-slate-300">
                      {paper.evaluation.suggestions.map((tip) => (
                        <li key={tip}>• {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-teal-200">
                  A report with suggestions is also shared to your parent&apos;s WhatsApp when available.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {showQr && uploadUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center shadow-xl">
            <button
              type="button"
              className="absolute right-3 top-3 text-slate-400 hover:text-white"
              onClick={() => setShowQr(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <QrCode className="mx-auto mb-2 h-8 w-8 text-violet-400" />
            <h2 className="mb-1 text-lg font-semibold">Scan to upload answers</h2>
            <p className="mb-4 text-sm text-slate-400">
              Open on your phone and add photos for each question. You can upload multiple images per question.
            </p>
            <img
              src={qrImageUrl(uploadUrl)}
              alt="QR code for answer upload"
              className="mx-auto rounded-lg bg-white p-2"
              width={240}
              height={240}
            />
            <p className="mt-4 break-all text-xs text-indigo-300">
              {typeof window !== "undefined" ? new URL(uploadUrl, window.location.origin).toString() : uploadUrl}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
