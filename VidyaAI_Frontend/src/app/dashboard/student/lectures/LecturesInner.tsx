"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Layers, PlayCircle } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SelectionCardRow } from "@/components/ui/SelectionCardRow";
import { api, getStoredUser } from "@/lib/api";
import { chapterDisplayLabel, chapterShortLabel } from "@/lib/chapterLabels";
import { isSchoolProgram, normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import type { Book, Chapter, LecturePart, LectureSchedule } from "@/types";

function readyParts(chapter: Chapter | null): LecturePart[] {
  if (!chapter) return [];
  return chapter.lecture_parts
    .filter((part) => part.status === "ready")
    .sort((a, b) => a.part_number - b.part_number);
}

function chapterIsReady(chapter: Chapter): boolean {
  return readyParts(chapter).length > 0;
}

function openClassroom(router: ReturnType<typeof useRouter>, lectureId: number, replayMode: boolean) {
  const params = new URLSearchParams({ lecture: String(lectureId) });
  if (replayMode) params.set("replay", "1");
  router.push(`/dashboard/student/lectures/classroom?${params.toString()}`);
}

export default function StudentLecturesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialChapterId = searchParams.get("chapter");
  const initialLectureId = searchParams.get("lecture");
  const replayMode = searchParams.get("replay") === "1";
  const user = getStoredUser();
  const program = normalizeProgram(user?.program ?? (user as { track?: string } | null)?.track);
  const isSchool = isSchoolProgram(program);

  const [books, setBooks] = useState<Book[]>([]);
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [lecturePartId, setLecturePartId] = useState<number | null>(null);
  const [openedLectureId, setOpenedLectureId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.books(), api.schedules()])
      .then(([data, scheduleRows]) => {
        setBooks(data);
        setSchedules(scheduleRows);
        if (initialChapterId) {
          const ch = data.flatMap((b) => b.chapters).find((c) => c.id === Number(initialChapterId));
          if (ch) {
            const book = data.find((b) => b.chapters.some((c) => c.id === ch.id));
            if (book) {
              setSubject(book.subject);
              setChapter(ch);
            }
          }
        }
      })
      .catch(console.error);
  }, [initialChapterId]);

  useEffect(() => {
    if (replayMode || initialChapterId || books.length === 0) return;
    const live = schedules.find((item) => item.status === "live" && item.lecture_id);
    if (!live) return;
    const ch = books.flatMap((b) => b.chapters).find((c) => c.id === live.chapter_id);
    if (ch) {
      setSubject(live.subject);
      setChapter(ch);
    }
  }, [replayMode, initialChapterId, books, schedules]);

  const subjects = [...new Set(books.map((b) => b.subject))];
  const chaptersForSubject = books
    .filter((b) => b.subject === subject)
    .flatMap((b) => b.chapters)
    .sort((a, b) => a.chapter_number - b.chapter_number);
  const liveChapterId = schedules.find((item) => item.status === "live")?.chapter_id;

  const partsForChapter = useMemo(() => readyParts(chapter), [chapter]);

  useEffect(() => {
    if (!chapter) {
      setLecturePartId(null);
      return;
    }
    const parts = readyParts(chapter);
    if (initialLectureId) {
      const fromUrl = parts.find((part) => part.id === Number(initialLectureId));
      setLecturePartId(fromUrl?.id ?? parts[0]?.id ?? null);
      return;
    }
    setLecturePartId(parts[0]?.id ?? null);
  }, [chapter, initialLectureId]);

  const activePart = partsForChapter.find((part) => part.id === lecturePartId) ?? partsForChapter[0] ?? null;

  function launchClassroom(lectureId: number, force = false) {
    if (!force && openedLectureId === lectureId) return;
    setOpenedLectureId(lectureId);
    openClassroom(router, lectureId, replayMode);
  }

  useEffect(() => {
    if (!activePart || !initialLectureId) return;
    if (activePart.id === Number(initialLectureId)) {
      launchClassroom(activePart.id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePart?.id, initialLectureId]);

  const subjectCards = subjects.map((item) => {
    const chapters = books.filter((b) => b.subject === item).flatMap((b) => b.chapters);
    const readyCount = chapters.filter(chapterIsReady).length;
    return {
      id: item,
      label: item,
      sublabel: `${readyCount} of ${chapters.length} topics ready`,
      icon: <BookOpen className="h-4 w-4" strokeWidth={1.75} />,
      badge: schedules.some((s) => s.status === "live" && s.subject === item) ? "Live now" : undefined,
      badgeTone: schedules.some((s) => s.status === "live" && s.subject === item)
        ? ("live" as const)
        : undefined,
    };
  });

  const chapterCards = chaptersForSubject.map((item) => {
    const ready = chapterIsReady(item);
    const isLive = liveChapterId === item.id;
    const partCount = readyParts(item).length;
    return {
      id: String(item.id),
      label: chapterShortLabel(item),
      sublabel: chapterDisplayLabel(item),
      icon: <Layers className="h-4 w-4" strokeWidth={1.75} />,
      badge: isLive ? "Live" : ready ? (partCount > 1 ? `${partCount} parts` : "Ready") : "Preparing",
      badgeTone: isLive ? ("live" as const) : ready ? ("ready" as const) : ("muted" as const),
      disabled: !ready,
    };
  });

  const partCards = partsForChapter.map((part) => ({
    id: String(part.id),
    label: partsForChapter.length > 1 ? `Part ${part.part_number}` : "Full lecture",
    sublabel: part.title,
    icon: <PlayCircle className="h-4 w-4" strokeWidth={1.75} />,
    badge: "Ready",
    badgeTone: "ready" as const,
  }));

  return (
    <DashboardShell title={replayMode ? "Recorded Session" : isSchool ? "Live Class" : `${PROGRAM_SHORT[program]} Live Class`}>
      {isSchool && user?.class_grade && (
        <p className="mb-4 text-sm text-slate-400">
          Class {user.class_grade} · Pick a subject, then choose your chapter to start class
        </p>
      )}
      {!isSchool && (
        <p className="mb-4 text-sm text-indigo-300">
          {PROGRAM_SHORT[program]} · Pick a subject, then your topic to start class
        </p>
      )}

      <div className="glass mb-4 space-y-6 rounded-2xl p-4 sm:mb-6 sm:p-6">
        <SelectionCardRow
          label="Subject"
          hint="Tap a subject card to select"
          items={subjectCards}
          value={subject}
          onChange={(id) => {
            setSubject(id);
            setChapter(null);
            setOpenedLectureId(null);
          }}
          emptyMessage="No subjects available in your learning path yet."
        />

        {subject && (
          <SelectionCardRow
            label="Chapter"
            hint="Tap a ready chapter to open class"
            items={chapterCards}
            value={chapter ? String(chapter.id) : ""}
            onChange={(id) => {
              const next = chaptersForSubject.find((item) => item.id === Number(id)) || null;
              setChapter(next);
              setOpenedLectureId(null);
              if (!next || !chapterIsReady(next)) return;
              const parts = readyParts(next);
              if (parts.length === 1) {
                setLecturePartId(parts[0].id);
                launchClassroom(parts[0].id);
              }
            }}
            emptyMessage="No chapters found for this subject."
          />
        )}

        {chapter && partCards.length > 1 && (
          <SelectionCardRow
            label="Lecture part"
            hint="Choose a part to start"
            items={partCards}
            value={lecturePartId ? String(lecturePartId) : ""}
            onChange={(id) => {
              const partId = Number(id);
              setLecturePartId(partId);
              launchClassroom(partId);
            }}
            emptyMessage="No lecture parts ready yet."
          />
        )}
      </div>

      {chapter && activePart && partCards.length <= 1 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-300">Ready to start — tap below to open class.</p>
          <button
            type="button"
            onClick={() => launchClassroom(activePart.id, true)}
            className="mt-3 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Reopen class
          </button>
        </div>
      ) : chapter && !activePart ? (
        <div className="glass rounded-2xl p-8 text-center text-slate-400">
          <p>Lecture is not ready yet. Ask your teacher to generate or schedule it.</p>
        </div>
      ) : (
        subject && <p className="text-center text-sm text-slate-400">Choose a ready chapter to start your class.</p>
      )}
    </DashboardShell>
  );
}
