"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api, getStoredUser } from "@/lib/api";
import { stashPracticePaper } from "@/lib/studentFocusWindow";
import type { Book, PracticePaper, PracticeTemplate } from "@/types";
import { isSchoolProgram, normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import { Button } from "@/components/ui/Button";
import { FriendlyLoader } from "@/components/ui/FriendlyLoader";
import { Select } from "@/components/ui/Select";
import { HelpCircle, PenLine } from "lucide-react";

const PLAN_TYPES = [
  { value: "mcq", label: "Quick quiz (choose answers on screen)" },
  { value: "chapter", label: "Written test — chosen lessons" },
  { value: "mid_term", label: "Half-year written exam" },
  { value: "full_term", label: "Full-year written exam" },
];

const TERM_PATTERNS: Record<
  string,
  { title: string; syllabus: string; rows: Array<{ type: string; marks: number; count: string; total: number }> }
> = {
  mid_term: {
    title: "Mid-Term (Half-Yearly) — Written Paper (80 Marks)",
    syllabus: "First half of the textbook (chapters 1 to midpoint)",
    rows: [
      { type: "MCQ / Objective", marks: 1, count: "20", total: 20 },
      { type: "Very Short Answer", marks: 2, count: "6", total: 12 },
      { type: "Short Answer", marks: 3, count: "6", total: 18 },
      { type: "Long Answer", marks: 5, count: "4", total: 20 },
      { type: "Case Study / Source-Based", marks: 3, count: "2", total: 6 },
      { type: "Map / Diagram", marks: 4, count: "1", total: 4 },
    ],
  },
  full_term: {
    title: "Full-Term (Annual) — Written Paper (80 Marks)",
    syllabus: "Complete textbook (all chapters)",
    rows: [
      { type: "MCQ / Objective", marks: 1, count: "20", total: 20 },
      { type: "Very Short Answer", marks: 2, count: "5", total: 10 },
      { type: "Short Answer", marks: 3, count: "6", total: 18 },
      { type: "Long Answer", marks: 5, count: "4", total: 20 },
      { type: "Case Study / Source-Based", marks: 4, count: "2", total: 8 },
      { type: "Map / Diagram / Practical", marks: 4, count: "1", total: 4 },
    ],
  },
};

export default function StudentPracticePage() {
  const router = useRouter();
  const user = getStoredUser();
  const program = normalizeProgram(user?.program ?? (user as { track?: string } | null)?.track);
  const isSchool = isSchoolProgram(program);
  const [books, setBooks] = useState<Book[]>([]);
  const [templates, setTemplates] = useState<PracticeTemplate[]>([]);
  const [papers, setPapers] = useState<PracticePaper[]>([]);
  const [subject, setSubject] = useState("");
  const [planType, setPlanType] = useState("chapter");
  const [chapterIds, setChapterIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");

  function openPracticeSession(paper: PracticePaper) {
    stashPracticePaper(paper);
    router.push(`/dashboard/student/practice/session?paper=${paper.id}`);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.books(), api.practiceTemplates(), api.practicePapers()]).then(
      ([booksResult, templatesResult, papersResult]) => {
        if (cancelled) return;
        if (booksResult.status === "fulfilled") setBooks(booksResult.value);
        if (templatesResult.status === "fulfilled") setTemplates(templatesResult.value);
        if (papersResult.status === "fulfilled") setPapers(papersResult.value);
        setPageLoading(false);
        const failed = [booksResult, templatesResult, papersResult].filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          const message = failed
            .map((r) => (r.status === "rejected" ? (r.reason as Error)?.message : ""))
            .filter(Boolean)
            .join("; ");
          setError(
            message.includes("fetch")
              ? "Could not reach the API. Ensure the backend is running on port 8002."
              : message || "Could not load practice data"
          );
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = [...new Set(books.map((b) => b.subject))];
  const chapters = books.filter((b) => b.subject === subject).flatMap((b) => b.chapters);
  const isTermExam = planType === "mid_term" || planType === "full_term";
  const isMcq = planType === "mcq";
  const termPattern = TERM_PATTERNS[planType];

  const autoChapterPreview = useMemo(() => {
    if (!isTermExam || chapters.length === 0) return null;
    const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
    if (planType === "full_term") return sorted;
    const half = Math.ceil(sorted.length / 2);
    return sorted.slice(0, half);
  }, [chapters, isTermExam, planType]);

  async function generateFromTemplate(templateId: number) {
    setLoading(true);
    setError("");
    try {
      const result = await api.generatePractice({ template_id: templateId });
      openPracticeSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate paper");
    } finally {
      setLoading(false);
    }
  }

  async function generateCustom() {
    if (!subject) return;
    if (planType === "chapter" && chapterIds.length === 0) {
      setError("Select at least one chapter");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload: {
        subject: string;
        plan_type: string;
        chapter_ids?: number[];
        question_count?: number;
      } = { subject, plan_type: planType };
      if (planType === "mcq") {
        payload.chapter_ids = chapterIds.length ? chapterIds : chapters.map((c) => c.id);
        payload.question_count = 15;
      } else if (!isTermExam) {
        payload.chapter_ids = chapterIds;
        payload.question_count = 12;
      }
      const result = await api.generatePractice(payload);
      openPracticeSession(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate paper");
    } finally {
      setLoading(false);
    }
  }

  if (pageLoading) {
    return (
      <DashboardShell title="Practice">
        <FriendlyLoader message="Setting up your practice area…" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Practice">
      <p className="mb-4 text-sm text-slate-400">
        {isSchool
          ? user?.class_grade
            ? `Class ${user.class_grade} — try a quick quiz or a full written paper.`
            : "Try a quick quiz on screen, or write answers on paper and upload photos for checking."
          : `${PROGRAM_SHORT[program]} practice — quizzes and written papers.`}
      </p>

      <div className="grid w-full gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {templates.length > 0 && (
            <section className="glass rounded-2xl p-5">
              <h2 className="mb-3 font-semibold">Teacher-assigned plans</h2>
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-slate-400">
                        {t.subject} · {t.plan_type.replace("_", " ")} · {t.question_count} Qs
                      </p>
                    </div>
                    <Button type="button" disabled={loading} onClick={() => generateFromTemplate(t.id)}>
                      Start
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <PenLine className="h-5 w-5 text-violet-400" />
              <h2 className="font-semibold">Start practicing</h2>
            </div>
            <div className="space-y-3">
              <Select
                value={subject}
                onChange={(value) => {
                  setSubject(value);
                  setChapterIds([]);
                  setError("");
                }}
                placeholder="Pick a subject"
                options={subjects.map((s) => ({ value: s, label: s }))}
                aria-label="Subject"
              />
              <Select
                value={planType}
                onChange={(value) => {
                  setPlanType(value);
                  setChapterIds([]);
                  setError("");
                }}
                options={PLAN_TYPES.map((p) => ({ value: p.value, label: p.label }))}
                aria-label="Practice type"
              />

              {isMcq && subject && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-100/90">
                  <p className="inline-flex items-center gap-2 font-medium">
                    <HelpCircle className="h-4 w-4" />
                    Quick quiz — answer on this screen
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Pick lessons below or leave all unchecked to quiz from the whole subject.
                  </p>
                </div>
              )}

              {isTermExam && termPattern && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
                  <p className="font-medium text-violet-200">{termPattern.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{termPattern.syllabus}</p>
                  {autoChapterPreview && (
                    <p className="mt-2 text-xs text-slate-400">
                      Chapters included:{" "}
                      {autoChapterPreview.map((c) => `Ch. ${c.chapter_number}`).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {!isTermExam && chapters.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-3">
                  <p className="mb-2 text-xs text-slate-400">
                    {isMcq ? "Optional — pick lessons to focus on" : "Pick lessons for this paper"}
                  </p>
                  {chapters.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={chapterIds.includes(c.id)}
                        onChange={(e) => {
                          setChapterIds((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          );
                        }}
                      />
                      Ch. {c.chapter_number}: {c.title}
                    </label>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-red-300">{error}</p>}

              <Button type="button" disabled={loading || !subject} onClick={generateCustom}>
                {loading ? "Preparing…" : isMcq ? "Start quick quiz" : "Create written paper"}
              </Button>
            </div>
          </section>
        </div>

        <section className="glass rounded-2xl p-5">
          {isTermExam && termPattern ? (
            <div className="text-sm">
              <h2 className="mb-3 font-semibold text-slate-200">Written exam pattern (CBSE)</h2>
              <p className="mb-3 text-xs text-slate-400">Internal assessment (20 marks) is not included — written paper only.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2 pr-2">Question type</th>
                      <th className="py-2 pr-2">Marks/Q</th>
                      <th className="py-2 pr-2">Questions</th>
                      <th className="py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termPattern.rows.map((row) => (
                      <tr key={row.type} className="border-b border-white/5">
                        <td className="py-2 pr-2">{row.type}</td>
                        <td className="py-2 pr-2">{row.marks}</td>
                        <td className="py-2 pr-2">{row.count}</td>
                        <td className="py-2">{row.total}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold text-slate-100">
                      <td className="py-2" colSpan={3}>
                        Total (written)
                      </td>
                      <td className="py-2">80</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="flex min-h-[280px] items-center justify-center text-center text-slate-400">
              Choose a subject and exam type. For Mid term or Full term, chapters are picked automatically from the
              textbook.
            </p>
          )}
        </section>
      </div>

      {papers.length > 0 && (
        <section className="glass mt-6 rounded-2xl p-5">
          <h2 className="mb-3 font-semibold">Practice history</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {papers.slice(0, 12).map((p) => {
              const percent =
                p.score != null && (p.total_marks || p.total_questions)
                  ? Math.round((p.score / (p.total_marks || p.total_questions || 1)) * 100)
                  : null;
              const statusLabel = (p.status || "in_progress").replace(/_/g, " ");
              return (
                <li key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm">
                  <button
                    type="button"
                    className="w-full text-left hover:text-indigo-200"
                    onClick={() => router.push(`/dashboard/student/practice/session?paper=${p.id}`)}
                  >
                    <p className="font-medium text-slate-100">{p.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.subject} · {(p.plan_type || "chapter").replace(/_/g, " ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-white/[0.06] px-2 py-0.5 capitalize text-slate-300">
                        {statusLabel}
                      </span>
                      {percent != null && (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-200">
                          {p.score}/{p.total_marks || p.total_questions} ({percent}%)
                        </span>
                      )}
                    </div>
                    {p.evaluation?.suggestions && p.evaluation.suggestions.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs text-teal-200/90">
                        Tip: {p.evaluation.suggestions[0]}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </DashboardShell>
  );
}
