"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import type { Book, PracticeTemplate } from "@/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ProgramPathPicker } from "@/components/programs/ProgramPathPicker";
import { SCHOOL_SUBJECTS, type ProgramPathValue } from "@/lib/programCatalog";
import { isSchoolProgram, PROGRAM_LABELS } from "@/lib/programs";

const PLAN_TYPES = [
  { value: "chapter", label: "Chapter test" },
  { value: "assessment", label: "Assessment" },
  { value: "half_term", label: "Half term" },
  { value: "mid_term", label: "Mid term" },
  { value: "full_term", label: "Full term" },
  { value: "mock_test", label: "Mock test" },
];

export default function AdminPracticePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [templates, setTemplates] = useState<PracticeTemplate[]>([]);
  const [title, setTitle] = useState("");
  const [planType, setPlanType] = useState("half_term");
  const [path, setPath] = useState<ProgramPathValue>({
    program: "school",
    examTrack: "",
    classGrade: 9,
    subject: SCHOOL_SUBJECTS[0],
  });
  const [chapterIds, setChapterIds] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(15);
  const [message, setMessage] = useState("");

  const load = () => {
    Promise.all([
      api.books({ program: path.program, exam_track: path.examTrack || undefined, class_grade: path.classGrade }),
      api.practiceTemplates({ program: path.program }),
    ])
      .then(([b, t]) => {
        setBooks(b);
        setTemplates(t);
      })
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, [path.program, path.examTrack, path.classGrade]);

  const chapters = books
    .filter(
      (b) =>
        b.subject === path.subject &&
        (b.program ?? "school") === path.program &&
        (isSchoolProgram(path.program) ? b.class_grade === path.classGrade : true) &&
        (!path.examTrack || !b.exam_track || b.exam_track === path.examTrack)
    )
    .flatMap((b) => b.chapters);

  return (
    <DashboardShell title="Practice Plans">
      <div className="grid w-full gap-6 xl:grid-cols-2">
        <form
          className="glass space-y-3 rounded-2xl p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.createPracticeTemplate({
                title,
                plan_type: planType,
                class_grade: isSchoolProgram(path.program) ? path.classGrade : 0,
                subject: path.subject,
                chapter_ids: chapterIds,
                question_count: questionCount,
                program: path.program,
              });
              setMessage("Practice plan created.");
              setTitle("");
              setChapterIds([]);
              load();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Failed");
            }
          }}
        >
          <h2 className="font-semibold">Create practice / mock test plan</h2>
          <p className="text-sm text-slate-400">
            Configure half-term, mid-term, chapter tests or mock exams. Students see these in Practice.
          </p>
          <input className="input-field" placeholder="Plan title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <ProgramPathPicker
            compact
            value={path}
            onChange={(next) => {
              setPath(next);
              setChapterIds([]);
            }}
          />
          <Select
            value={planType}
            onChange={setPlanType}
            options={PLAN_TYPES.map((p) => ({ value: p.value, label: p.label }))}
            aria-label="Plan type"
          />
          {chapters.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-3">
              {chapters.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chapterIds.includes(c.id)}
                    onChange={(e) =>
                      setChapterIds((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                      )
                    }
                  />
                  Ch. {c.chapter_number}: {c.title}
                </label>
              ))}
            </div>
          )}
          <input className="input-field" type="number" min={5} max={50} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} />
          <Button type="submit">Save plan</Button>
          {message && <p className="text-sm text-cyan-300">{message}</p>}
        </form>

        <div className="glass rounded-2xl p-5">
          <h2 className="mb-4 font-semibold">Existing plans</h2>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-slate-400">
                    {t.subject} · {t.plan_type} · {PROGRAM_LABELS[(t.program ?? "school") as keyof typeof PROGRAM_LABELS]}
                    {t.class_grade ? ` · Class ${t.class_grade}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() => api.deletePracticeTemplate(t.id).then(load)}
                >
                  Delete
                </button>
              </li>
            ))}
            {!templates.length && <p className="text-sm text-slate-400">No plans yet.</p>}
          </ul>
        </div>
      </div>
    </DashboardShell>
  );
}
