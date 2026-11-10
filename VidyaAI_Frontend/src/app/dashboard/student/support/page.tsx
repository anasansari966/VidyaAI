"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { api, getStoredUser } from "@/lib/api";
import { isSchoolProgram, normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import type { Book } from "@/types";
import { History, MessageCircle, Trash2 } from "lucide-react";

type SupportSession = {
  chapter_id: number;
  subject: string;
  chapter_title: string;
  chapter_number?: number | null;
  last_message: string;
  last_role: string;
  updated_at?: string | null;
};

function SupportInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = getStoredUser();
  const program = normalizeProgram(user?.program ?? (user as { track?: string } | null)?.track);
  const isSchool = isSchoolProgram(program);
  const [books, setBooks] = useState<Book[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [sessions, setSessions] = useState<SupportSession[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [subject, setSubject] = useState(searchParams.get("subject") ?? "");
  const [chapterId, setChapterId] = useState<number | "">(
    searchParams.get("chapter") ? Number(searchParams.get("chapter")) : ""
  );
  const [bookPage, setBookPage] = useState<number | "">(
    searchParams.get("page") ? Number(searchParams.get("page")) : ""
  );

  useEffect(() => {
    setBooksLoading(true);
    api
      .books()
      .then(setBooks)
      .catch(console.error)
      .finally(() => setBooksLoading(false));
    api
      .supportSessions()
      .then((res) => setSessions(res.sessions || []))
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    setChapterId("");
    setBookPage("");
  }, [subject]);

  const subjects = [...new Set(books.map((b) => b.subject))];
  const chapters = books.filter((b) => b.subject === subject).flatMap((b) => b.chapters ?? []);
  const hasClassContent = books.length > 0 && subjects.length > 0;
  const canStart = Boolean(subject && chapterId && chapters.some((c) => c.id === chapterId));

  function openSupportSession(opts?: { subject: string; chapterId: number; page?: number | ""; title?: string; number?: number | null }) {
    const nextSubject = opts?.subject ?? subject;
    const nextChapter = opts?.chapterId ?? chapterId;
    if (!nextSubject || !nextChapter) return;
    const params = new URLSearchParams({
      subject: nextSubject,
      chapter: String(nextChapter),
    });
    const page = opts?.page ?? bookPage;
    if (page) params.set("page", String(page));
    const selected = chapters.find((c) => c.id === nextChapter);
    const label =
      opts?.title != null
        ? `${opts.number != null ? `Ch. ${opts.number}: ` : ""}${opts.title}`
        : selected
          ? `Ch. ${selected.chapter_number}: ${selected.title}`
          : undefined;
    if (label) params.set("label", label);
    router.push(`/dashboard/student/support/chat?${params.toString()}`);
  }

  async function deleteSession(s: SupportSession) {
    const key = `${s.subject}-${s.chapter_id}`;
    const label =
      s.chapter_number != null
        ? `${s.subject} · Ch. ${s.chapter_number}: ${s.chapter_title}`
        : `${s.subject}: ${s.chapter_title}`;
    if (!window.confirm(`Delete chat history for ${label}?`)) return;
    setDeletingKey(key);
    try {
      await api.supportDeleteHistory({ subject: s.subject, chapter_id: s.chapter_id });
      setSessions((prev) => prev.filter((row) => !(row.subject === s.subject && row.chapter_id === s.chapter_id)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete chat history.");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <DashboardShell title="Support">
      <p className="mb-4 text-sm text-slate-400">
        {isSchool
          ? user?.class_grade
            ? `Class ${user.class_grade} — choose subject and chapter to chat with AI support.`
            : "Choose subject and chapter to open AI support."
          : `${PROGRAM_SHORT[program]} support — answers are limited to your selected chapter only.`}
      </p>

      <div className="glass mb-4 grid gap-3 rounded-2xl p-4 md:grid-cols-3">
        <Select
          size="sm"
          value={subject}
          onChange={setSubject}
          placeholder="Subject"
          options={subjects.map((s) => ({ value: s, label: s }))}
          aria-label="Subject"
          disabled={!hasClassContent || booksLoading}
        />
        <Select
          size="sm"
          value={chapterId === "" ? "" : String(chapterId)}
          onChange={(value) => setChapterId(value ? Number(value) : "")}
          placeholder="Chapter"
          options={chapters.map((c) => ({
            value: String(c.id),
            label: `Ch. ${c.chapter_number}: ${c.title}`,
          }))}
          aria-label="Chapter"
          disabled={!subject || chapters.length === 0}
        />
        <input
          className="input-field text-sm"
          type="number"
          min={1}
          placeholder="Textbook page (optional)"
          value={bookPage}
          disabled={!canStart}
          onChange={(e) => setBookPage(e.target.value ? Number(e.target.value) : "")}
        />
      </div>

      <div className="glass mb-4 flex min-h-[220px] flex-col items-center justify-center rounded-2xl p-8 text-center">
        {booksLoading ? (
          <p className="text-slate-400">Loading your class material…</p>
        ) : !hasClassContent ? (
          <p className="text-slate-400">
            {isSchool
              ? "No books or chapters are published for your class yet."
              : "No study material is published for your program yet."}
          </p>
        ) : !canStart ? (
          <p className="text-slate-400">Select a subject and chapter above to continue.</p>
        ) : (
          <>
            <MessageCircle className="mb-3 h-10 w-10 text-indigo-400" />
            <p className="mb-4 max-w-md text-sm text-slate-300">
              Answers stay inside this chapter only. Ask in Hindi to get Hinglish replies (English letters). Chat history is saved per chapter.
            </p>
            <Button type="button" onClick={() => openSupportSession()}>
              Open support session
            </Button>
          </>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="glass rounded-2xl p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
            <History className="h-4 w-4 text-slate-400" />
            Previous chapter chats
          </div>
          <ul className="space-y-2">
            {sessions.map((s) => {
              const key = `${s.subject}-${s.chapter_id}`;
              const busy = deletingKey === key;
              return (
                <li key={key} className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      openSupportSession({
                        subject: s.subject,
                        chapterId: s.chapter_id,
                        title: s.chapter_title,
                        number: s.chapter_number,
                      })
                    }
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:bg-white/[0.06]"
                  >
                    <p className="text-sm text-slate-200">
                      {s.subject}
                      {s.chapter_number != null ? ` · Ch. ${s.chapter_number}` : ""}: {s.chapter_title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-400">{s.last_message}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSession(s)}
                    disabled={busy}
                    title="Delete chat history"
                    aria-label={`Delete chat history for ${s.chapter_title}`}
                    className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 transition hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                  >
                    <Trash2 className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardShell>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="mesh-bg min-h-screen p-8 text-slate-400">Loading support…</div>}>
      <SupportInner />
    </Suspense>
  );
}
