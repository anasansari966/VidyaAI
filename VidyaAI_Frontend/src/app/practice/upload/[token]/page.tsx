"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Camera, CheckCircle2, Loader2, Trash2, Upload } from "lucide-react";

type UploadQuestion = {
  number: number;
  question: string;
  marks: number;
  type?: string | null;
};

const MAX_PER_QUESTION = 4;

export default function PracticeUploadPage() {
  const params = useParams();
  const token = String(params.token ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("awaiting_upload");
  const [questions, setQuestions] = useState<UploadQuestion[]>([]);
  const [filesByQuestion, setFilesByQuestion] = useState<Record<number, File[]>>({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    score: number | null;
    total: number;
    percent: number;
    evaluation: import("@/types").PracticePaper["evaluation"];
  } | null>(null);

  const totalSelected = useMemo(
    () => Object.values(filesByQuestion).reduce((sum, list) => sum + list.length, 0),
    [filesByQuestion]
  );

  const loadSession = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const session = await api.practiceUploadSession(token);
      setTitle(session.title);
      setSubject(session.subject);
      setStatus(session.status);
      setQuestions(session.questions ?? []);
      if (session.status === "graded" || session.status === "evaluating") {
        const res = await api.practiceUploadResult(token);
        if (res.status === "graded") {
          setResult({
            score: res.score,
            total: res.total,
            percent: res.percent,
            evaluation: res.evaluation,
          });
        }
        setStatus(res.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload link invalid or expired");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (status !== "evaluating") return;
    const interval = setInterval(async () => {
      try {
        const res = await api.practiceUploadResult(token);
        setStatus(res.status);
        if (res.status === "graded") {
          setResult({
            score: res.score,
            total: res.total,
            percent: res.percent,
            evaluation: res.evaluation,
          });
          clearInterval(interval);
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [status, token]);

  function addFiles(qNumber: number, selected: File[]) {
    if (!selected.length) return;
    setFilesByQuestion((prev) => {
      const current = prev[qNumber] ?? [];
      const merged = [...current, ...selected].slice(0, MAX_PER_QUESTION);
      return { ...prev, [qNumber]: merged };
    });
  }

  function removeFile(qNumber: number, index: number) {
    setFilesByQuestion((prev) => {
      const current = [...(prev[qNumber] ?? [])];
      current.splice(index, 1);
      const next = { ...prev };
      if (current.length) next[qNumber] = current;
      else delete next[qNumber];
      return next;
    });
  }

  async function handleUpload() {
    if (!totalSelected) return;
    setUploading(true);
    setError(null);
    try {
      const res = await api.uploadPracticeQuestionImages(token, filesByQuestion);
      setStatus(res.status);
      setFilesByQuestion({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="mesh-bg flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className="mesh-bg flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-red-300">{error}</p>
      </div>
    );
  }

  return (
    <div className="mesh-bg min-h-screen px-4 py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="text-center">
          <p className="text-xs uppercase tracking-widest text-violet-300">VidyaAI Answer Upload</p>
          <h1 className="mt-2 text-xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subject}</p>
          <p className="mt-2 text-xs text-slate-500">
            Add clear photos for each question (up to {MAX_PER_QUESTION} images per question).
          </p>
        </header>

        {result && (
          <section className="glass rounded-2xl p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-400" />
            <p className="text-lg font-semibold">
              {result.score ?? 0}/{result.total} marks ({result.percent}%)
            </p>
            {result.evaluation?.summary && (
              <p className="mt-2 text-sm text-slate-300">{result.evaluation.summary}</p>
            )}
            {result.evaluation?.suggestions && result.evaluation.suggestions.length > 0 && (
              <div className="mt-4 rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
                  Suggestions
                </p>
                <ul className="space-y-1 text-sm text-slate-300">
                  {result.evaluation.suggestions.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.evaluation?.questions && result.evaluation.questions.length > 0 && (
              <ul className="mt-4 space-y-2 text-left text-sm text-slate-400">
                {result.evaluation.questions.map((q) => (
                  <li key={q.number} className="rounded-lg bg-white/[0.03] px-3 py-2">
                    Q{q.number}: {q.marks_awarded}/{q.max_marks} — {q.feedback}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {status === "evaluating" && !result && (
          <section className="glass rounded-2xl p-5 text-center text-amber-300">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
            AI is grading your answers…
          </section>
        )}

        {!result && status !== "evaluating" && (
          <section className="space-y-4">
            {questions.length === 0 ? (
              <p className="glass rounded-2xl p-5 text-sm text-slate-400">
                No questions found for this paper. Ask your teacher to regenerate it.
              </p>
            ) : (
              questions.map((q) => {
                const files = filesByQuestion[q.number] ?? [];
                return (
                  <article key={q.number} className="glass space-y-3 rounded-2xl p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
                        Question {q.number} · {q.marks} mark{q.marks === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">{q.question}</p>
                    </div>

                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-3 py-4 text-sm text-slate-300 hover:bg-white/[0.06]">
                      <Camera className="h-5 w-5 text-violet-400" />
                      Add photos ({files.length}/{MAX_PER_QUESTION})
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="sr-only"
                        disabled={files.length >= MAX_PER_QUESTION}
                        onChange={(e) => {
                          addFiles(q.number, Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {files.length > 0 && (
                      <ul className="space-y-1.5">
                        {files.map((f, i) => (
                          <li
                            key={`${f.name}-${i}`}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-slate-400"
                          >
                            <span className="truncate">
                              {i + 1}. {f.name}
                            </span>
                            <button
                              type="button"
                              className="text-slate-500 hover:text-rose-300"
                              onClick={() => removeFile(q.number, i)}
                              aria-label="Remove photo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })
            )}

            {error && <p className="text-sm text-red-300">{error}</p>}

            <Button
              type="button"
              disabled={!totalSelected || uploading}
              onClick={() => void handleUpload()}
              className="w-full"
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Submit {totalSelected} photo{totalSelected === 1 ? "" : "s"}
                </span>
              )}
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
