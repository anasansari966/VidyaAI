"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api, getStoredUser } from "@/lib/api";
import { chapterDisplayLabel } from "@/lib/chapterLabels";
import type { Book, Chapter } from "@/types";
import { Button } from "@/components/ui/Button";
import { Sparkles, RefreshCw, Loader2, CheckSquare, Square, Trash2, ChevronLeft, ChevronRight, Atom, Building2, GraduationCap, Stethoscope, Plus } from "lucide-react";
import { ProgramPathPicker } from "@/components/programs/ProgramPathPicker";
import {
  bookBrowseLabel,
  booksInDomainGroup,
  defaultExamTrack,
  defaultSubject,
  formatPathLabel,
  getTrack,
  listDomainGroups,
  PROGRAM_CATALOG,
  summarizeDomains,
  type ProgramPathValue,
} from "@/lib/programCatalog";
import { isSchoolProgram, normalizeProgram, PROGRAM_SHORT, type Program } from "@/lib/programs";
import { UploadProgressPanel } from "@/components/books/UploadProgressPanel";
import {
  LECTURE_LANGUAGE_OPTIONS,
  LECTURE_PERSONA_OPTIONS,
  languageLabel,
  lectureLanguageFromBook,
  loadLectureLanguage,
  loadLecturePersona,
  saveLecturePreferences,
} from "@/lib/lecturePreferences";

const DOMAIN_ICONS: Record<Program, typeof GraduationCap> = {
  school: GraduationCap,
  jee: Atom,
  neet: Stethoscope,
  govt: Building2,
};

type ManualChapterDraft = {
  id: string;
  chapterNumber: string;
  title: string;
  content: string;
  source: "context" | "upload";
  fileName: string;
  extracting: boolean;
  sourceFilePath: string;
  sourceFileType: string;
  pdfPageCount: number | null;
};

function newManualChapterDraft(chapterNumber = "1"): ManualChapterDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    chapterNumber,
    title: "",
    content: "",
    source: "context",
    fileName: "",
    extracting: false,
    sourceFilePath: "",
    sourceFileType: "",
    pdfPageCount: null,
  };
}

type BrowseView =
  | { step: "domains" }
  | { step: "groups"; program: Program }
  | { step: "books"; program: Program; groupKey: string };

const POLL_MS = 2500;
const MAX_POLL_ATTEMPTS = 240;

function initialBrowseView(adminProgram: Program, adminExamTrack: string): BrowseView {
  if (!isSchoolProgram(adminProgram)) {
    if (PROGRAM_CATALOG[adminProgram].tracks.length <= 1) {
      return {
        step: "books",
        program: adminProgram,
        groupKey: adminExamTrack || defaultExamTrack(adminProgram),
      };
    }
    return { step: "groups", program: adminProgram };
  }
  // School admins go straight to classes — skip the redundant "School" domain card.
  return { step: "groups", program: "school" };
}

export default function AdminBooksPage() {
  const adminUser = getStoredUser();
  const adminProgram = normalizeProgram(adminUser?.program);
  const adminExamTrack = adminUser?.exam_track || defaultExamTrack(adminProgram);

  const [path, setPath] = useState<ProgramPathValue>(() => ({
    program: adminProgram,
    examTrack: isSchoolProgram(adminProgram) ? "" : adminExamTrack,
    classGrade: 10,
    subject: defaultSubject(adminProgram, adminExamTrack),
  }));
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [browseView, setBrowseView] = useState<BrowseView>(() =>
    initialBrowseView(adminProgram, adminExamTrack)
  );
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "running" | "complete">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMessage, setUploadStatusMessage] = useState("");
  const [uploadBatch, setUploadBatch] = useState({ current: 0, total: 0, fileName: "" });
  const [isPollingProcessing, setIsPollingProcessing] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [addMode, setAddMode] = useState<"complete" | "individual">("complete");
  const [manualChapters, setManualChapters] = useState<ManualChapterDraft[]>(() => [
    newManualChapterDraft("1"),
  ]);
  const [lectureLanguage, setLectureLanguage] = useState(() => loadLectureLanguage());
  const [lecturePersona, setLecturePersona] = useState(() => loadLecturePersona());
  const [message, setMessage] = useState("");
  const [generatingChapterIds, setGeneratingChapterIds] = useState<Set<number>>(new Set());
  const pollTimers = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const languageUserOverride = useRef(false);

  const loadBooks = useCallback(async () => {
    const data = await api.books();
    setBooks(data);
    setSelectedBook((prev) => {
      if (!prev) return prev;
      return data.find((b) => b.id === prev.id) ?? prev;
    });
    return data;
  }, []);

  useEffect(() => {
    loadBooks()
      .then((data) => {
        if (data.some((b) => b.status === "processing")) {
          setIsPollingProcessing(true);
        }
      })
      .catch(console.error);
    if (adminUser?.program) {
      const program = normalizeProgram(adminUser.program);
      const examTrack = adminUser.exam_track || defaultExamTrack(program);
      setPath((prev) => ({
        ...prev,
        program,
        examTrack: isSchoolProgram(program) ? "" : examTrack,
        subject: defaultSubject(program, examTrack),
      }));
      setBrowseView(initialBrowseView(program, examTrack));
    }
    return () => {
      pollTimers.current.forEach((t) => clearInterval(t));
      pollTimers.current.clear();
    };
  }, [loadBooks]);

  useEffect(() => {
    if (!isPollingProcessing) return;

    const timer = setInterval(() => {
      void loadBooks().then((data) => {
        const processing = data.filter((b) => b.status === "processing");
        if (processing.length === 0) {
          setIsPollingProcessing(false);
          setUploadPhase((phase) => {
            if (phase === "running") {
              setUploadProgress(100);
              setUploadStatusMessage("All books ready!");
              setTimeout(() => setUploadPhase("idle"), 2000);
              return "complete";
            }
            return phase;
          });
          return;
        }

        const avgProgress = Math.round(
          processing.reduce((sum, b) => sum + (b.processing_progress ?? 0), 0) / processing.length
        );
        setUploadProgress(avgProgress);
        setUploadStatusMessage(
          processing.length > 1
            ? `Organising chapters for ${processing.length} books…`
            : processing[0].processing_message || "Organising chapters…"
        );
        setUploadBatch({ current: processing.length, total: processing.length, fileName: "" });
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [isPollingProcessing, loadBooks]);

  useEffect(() => {
    if (!selectedBook) return;

    let cancelled = false;
    const backfill = async () => {
      try {
        const current = await api.book(selectedBook.id);
        const needsContent = current.chapters.some(
          (chapter) => (chapter.content?.trim().length ?? 0) < 100
        );
        if (!needsContent || cancelled) return;
        await api.refreshBookContent(selectedBook.id);
        if (!cancelled) await loadBooks();
      } catch {
        /* retry on next interval */
      }
    };

    void backfill();
    const timer = setInterval(() => void backfill(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedBook?.id, loadBooks]);

  useEffect(() => {
    saveLecturePreferences(lectureLanguage, lecturePersona);
  }, [lectureLanguage, lecturePersona]);

  const stopPolling = useCallback((chapterId: number) => {
    const timer = pollTimers.current.get(chapterId);
    if (timer) {
      clearInterval(timer);
      pollTimers.current.delete(chapterId);
    }
    setGeneratingChapterIds((prev) => {
      const next = new Set(prev);
      next.delete(chapterId);
      return next;
    });
  }, []);

  const startPolling = useCallback(
    (chapterId: number, chapterTitle: string) => {
      if (pollTimers.current.has(chapterId)) return;

      setGeneratingChapterIds((prev) => new Set(prev).add(chapterId));

      let attempts = 0;
      const timer = setInterval(async () => {
        attempts += 1;
        try {
          const status = await api.chapterStatus(chapterId);
          await loadBooks();

          if (status.status === "ready") {
            stopPolling(chapterId);
            setMessage(`Lecture ready for "${chapterTitle}".`);
            return;
          }
          if (status.status === "failed") {
            stopPolling(chapterId);
            setMessage(`Generation failed for "${chapterTitle}". Please try again.`);
            return;
          }
          if (attempts >= MAX_POLL_ATTEMPTS) {
            stopPolling(chapterId);
            setMessage(
              `Generation is taking longer than expected for "${chapterTitle}". Refresh to check status.`
            );
          }
        } catch {
          if (attempts >= MAX_POLL_ATTEMPTS) {
            stopPolling(chapterId);
          }
        }
      }, POLL_MS);

      pollTimers.current.set(chapterId, timer);
    },
    [loadBooks, stopPolling]
  );

  function toggleChapter(chapterId: number) {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  function selectAllChapters() {
    if (!selectedBook) return;
    setSelectedChapterIds(new Set(selectedBook.chapters.map((c) => c.id)));
  }

  function clearChapterSelection() {
    setSelectedChapterIds(new Set());
  }

  function selectBook(book: Book) {
    setSelectedBook(book);
    setSelectedChapterIds(new Set());
    setMessage("");
    languageUserOverride.current = false;
    const detected = lectureLanguageFromBook(book);
    if (detected) setLectureLanguage(detected);
  }

  useEffect(() => {
    if (!selectedBook || languageUserOverride.current) return;
    const detected = lectureLanguageFromBook(selectedBook);
    if (detected) setLectureLanguage(detected);
  }, [selectedBook?.id, selectedBook?.content_language, selectedBook?.subject]);

  function openDomain(program: Program) {
    if (program !== adminProgram) return;
    setBrowseView({ step: "groups", program });
    setSelectedBook(null);
    setSelectedChapterIds(new Set());
    setMessage("");
    setPath((prev) => ({ ...prev, program, examTrack: prev.program === program ? prev.examTrack : adminExamTrack }));
  }

  function openGroup(program: Program, groupKey: string) {
    if (program !== adminProgram) return;
    if (!isSchoolProgram(program) && adminExamTrack && groupKey !== adminExamTrack) return;
    setBrowseView({ step: "books", program, groupKey });
    setSelectedBook(null);
    setSelectedChapterIds(new Set());
    setMessage("");
    if (program === "school") {
      setPath((prev) => ({ ...prev, program, classGrade: Number(groupKey) }));
    } else {
      setPath((prev) => ({ ...prev, program, examTrack: groupKey }));
    }
  }

  function browseBack() {
    if (browseView.step === "books") {
      if (!isSchoolProgram(adminProgram) && PROGRAM_CATALOG[adminProgram].tracks.length <= 1) {
        setBrowseView({ step: "groups", program: adminProgram });
      } else {
        setBrowseView({ step: "groups", program: browseView.program });
      }
    } else if (browseView.step === "groups") {
      // School program stays on classes; non-school can return to domain list only when useful.
      if (!isSchoolProgram(adminProgram) && PROGRAM_CATALOG[adminProgram].tracks.length > 1) {
        setBrowseView({ step: "domains" });
      }
    }
    setSelectedBook(null);
    setSelectedChapterIds(new Set());
  }

  function filterGroupsForAdmin(groups: ReturnType<typeof listDomainGroups>) {
    if (isSchoolProgram(adminProgram) || !adminExamTrack) return groups;
    return groups.filter((group) => group.key === adminExamTrack);
  }

  async function handleDeleteBook(book: Book, e: React.MouseEvent) {
    e.stopPropagation();
    const label = bookBrowseLabel(book);
    if (
      !window.confirm(
        `Delete Book #${book.id} (${label})?\n\nThis removes all chapters, lectures, notes, and support chats for this book.`
      )
    ) {
      return;
    }

    setDeletingBookId(book.id);
    try {
      await api.deleteBook(book.id);
      if (selectedBook?.id === book.id) {
        setSelectedBook(null);
        setSelectedChapterIds(new Set());
      }
      await loadBooks();
      setMessage(`Deleted Book #${book.id} — ${book.subject}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingBookId(null);
    }
  }

  const activeDomainBooks =
    browseView.step === "domains"
      ? books
      : browseView.step === "groups"
        ? books.filter((b) => (b.program ?? "school") === browseView.program)
        : browseView.step === "books"
          ? booksInDomainGroup(books, browseView.program, browseView.groupKey)
          : books;

  const domainSummaries = summarizeDomains(books).filter((domain) => domain.program === adminProgram);
  const browseGroups =
    browseView.step !== "domains"
      ? filterGroupsForAdmin(listDomainGroups(browseView.program, activeDomainBooks))
      : [];
  const browseBooks =
    browseView.step === "books"
      ? [...booksInDomainGroup(books, browseView.program, browseView.groupKey)].sort((a, b) => {
          const subjectCmp = a.subject.localeCompare(b.subject);
          if (subjectCmp !== 0) return subjectCmp;
          return a.id - b.id;
        })
      : [];

  const showChaptersPanel =
    selectedBook != null &&
    browseView.step === "books" &&
    browseBooks.some((b) => b.id === selectedBook.id);

  function browseTitle(): string {
    if (browseView.step === "domains") {
      return isSchoolProgram(adminProgram) ? "Books library" : PROGRAM_CATALOG[adminProgram].label;
    }
    if (browseView.step === "groups") {
      return isSchoolProgram(adminProgram) ? "Books by class" : PROGRAM_CATALOG[browseView.program].label;
    }
    if (browseView.program === "school") return `Class ${browseView.groupKey} — Books`;
    const track = getTrack(browseView.program, browseView.groupKey);
    return track ? `${track.label} — Books` : "Books";
  }

  function bookTitleForUpload(): string {
    const trackLabel =
      path.program === "school"
        ? `Class ${path.classGrade}`
        : formatPathLabel(path.program, path.examTrack).split("·").pop()?.trim() ?? "";
    return (
      title.trim() ||
      `${path.subject} — ${PROGRAM_CATALOG[path.program].short}${
        trackLabel ? ` (${trackLabel})` : ""
      }`
    );
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;
    setLoading(true);
    setMessage("");
    setUploadPhase("running");
    setUploadProgress(5);
    setUploadBatch({ current: 0, total: files.length, fileName: files[0]?.name ?? "" });
    setUploadStatusMessage(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);

    const uploadedTitle = bookTitleForUpload();
    const createdBookIds: number[] = [];
    const failures: string[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const uploadFile = files[index];
        setUploadBatch({ current: index + 1, total: files.length, fileName: uploadFile.name });
        setUploadStatusMessage(`Uploading ${index + 1} of ${files.length}: ${uploadFile.name}`);

        const fileStem = uploadFile.name.replace(/\.[^.]+$/, "").trim();
        const bookTitle =
          files.length === 1
            ? uploadedTitle
            : `${uploadedTitle}${fileStem ? ` — ${fileStem}` : ` — Part ${index + 1}`}`;

        const form = new FormData();
        form.append("program", path.program);
        form.append("exam_track", path.examTrack || "");
        form.append("class_grade", String(path.program === "school" ? path.classGrade : 0));
        form.append("subject", path.subject);
        form.append("title", bookTitle);
        // Each PDF is its own book so chapter numbers come from that file's TOC.
        form.append("merge_into_subject", "false");
        form.append("file", uploadFile);

        try {
          const book = await api.uploadBook(form);
          createdBookIds.push(book.id);
        } catch (err) {
          failures.push(
            `${uploadFile.name}: ${err instanceof Error ? err.message : "Upload failed"}`
          );
        }
      }

      if (!createdBookIds.length) {
        throw new Error(failures.join("; ") || "No books were uploaded");
      }

      const targetBookId = createdBookIds[createdBookIds.length - 1];
      const uploadedBook = await api.book(targetBookId);
      const stillProcessing = uploadedBook.status === "processing";
      if (stillProcessing) {
        setIsPollingProcessing(true);
        setUploadProgress(15);
        setUploadStatusMessage("Files saved — organising chapters from each book…");
      } else {
        setUploadPhase("complete");
        setUploadProgress(100);
        setTimeout(() => setUploadPhase("idle"), 2000);
      }

      const groupKey =
        path.program === "school"
          ? String(uploadedBook.class_grade)
          : uploadedBook.exam_track || path.examTrack || "";
      setBrowseView({ step: "books", program: path.program, groupKey });
      selectBook(uploadedBook);
      setMessage(
        failures.length
          ? `Uploaded ${createdBookIds.length} book(s). ${failures.length} file(s) failed: ${failures.join("; ")}`
          : files.length === 1
            ? `${path.subject} book ready. Chapters are taken from this file's table of contents.`
            : `${createdBookIds.length} books uploaded separately. Each keeps its own chapter numbers from its PDF.`
      );
      setFiles([]);
      setTitle("");
      await loadBooks();
    } catch (err) {
      setUploadPhase("idle");
      setIsPollingProcessing(false);
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
      setUploadBatch({ current: 0, total: 0, fileName: "" });
    }
  }

  async function handleManualCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (manualChapters.some((row) => row.extracting)) {
        throw new Error("Wait for file text extraction to finish.");
      }

      const chapters = manualChapters.map((row, index) => {
        const chapter_number = Number(row.chapterNumber.trim());
        const chTitle = row.title.trim();
        const content = row.content.trim();
        if (!Number.isInteger(chapter_number) || chapter_number <= 0) {
          throw new Error(`Row ${index + 1}: enter a valid chapter number`);
        }
        if (!chTitle) {
          throw new Error(`Chapter ${chapter_number}: name is required`);
        }
        if (row.source === "upload" && !row.fileName && !content) {
          throw new Error(`Chapter ${chapter_number}: upload a PDF/DOCX or switch to typed context`);
        }
        if (content.length < 100) {
          throw new Error(
            row.source === "upload"
              ? `Chapter ${chapter_number}: upload a file with enough readable text (at least 100 characters)`
              : `Chapter ${chapter_number}: add more context (at least 100 characters)`
          );
        }
        return {
          chapter_number,
          title: chTitle,
          content,
          ...(row.sourceFilePath
            ? {
                source_file_path: row.sourceFilePath,
                source_file_type: row.sourceFileType || undefined,
                pdf_page_count: row.pdfPageCount ?? undefined,
              }
            : {}),
        };
      });

      const numbers = chapters.map((c) => c.chapter_number);
      if (new Set(numbers).size !== numbers.length) {
        throw new Error("Each chapter needs a unique number");
      }

      const bookTitle =
        title.trim() ||
        `${path.subject} — ${PROGRAM_CATALOG[path.program].short} (manual)`;

      const book = await api.createManualBook({
        program: path.program,
        exam_track: path.examTrack || "",
        class_grade: path.program === "school" ? path.classGrade : 0,
        subject: path.subject,
        title: bookTitle,
        chapters,
      });

      const groupKey =
        path.program === "school"
          ? String(book.class_grade)
          : book.exam_track || path.examTrack || "";
      setBrowseView({ step: "books", program: path.program, groupKey });
      selectBook(book);
      setTitle("");
      setManualChapters([newManualChapterDraft("1")]);
      setMessage(
        `Created “${book.title}” with ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}. Select chapters below to generate lectures.`
      );
      await loadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create chapters");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualChapterFile(rowId: string, file: File | null) {
    if (!file) {
      setManualChapters((prev) =>
        prev.map((item) =>
          item.id === rowId
            ? {
                ...item,
                fileName: "",
                content: "",
                sourceFilePath: "",
                sourceFileType: "",
                pdfPageCount: null,
              }
            : item
        )
      );
      return;
    }

    setManualChapters((prev) =>
      prev.map((item) =>
        item.id === rowId
          ? {
              ...item,
              extracting: true,
              fileName: file.name,
              content: "",
              sourceFilePath: "",
              sourceFileType: "",
              pdfPageCount: null,
            }
          : item
      )
    );
    setMessage(`Reading text from ${file.name}…`);

    try {
      const result = await api.extractChapterText(file);
      setManualChapters((prev) =>
        prev.map((item) =>
          item.id === rowId
            ? {
                ...item,
                extracting: false,
                fileName: result.file_name,
                content: result.text,
                sourceFilePath: result.source_file_path || "",
                sourceFileType: result.source_file_type || "",
                pdfPageCount: result.pdf_page_count ?? null,
                title: item.title.trim() || file.name.replace(/\.[^.]+$/, "").trim(),
              }
            : item
        )
      );
      setMessage(
        `Loaded ${result.char_count.toLocaleString()} characters from ${result.file_name}. You can edit the text before creating.`
      );
    } catch (err) {
      setManualChapters((prev) =>
        prev.map((item) =>
          item.id === rowId
            ? {
                ...item,
                extracting: false,
                fileName: "",
                content: "",
                sourceFilePath: "",
                sourceFileType: "",
                pdfPageCount: null,
              }
            : item
        )
      );
      setMessage(err instanceof Error ? err.message : "Failed to read file");
    }
  }

  async function generateSelectedLectures() {
    if (!selectedBook) {
      setMessage("Select a book first.");
      return;
    }
    const ids = Array.from(selectedChapterIds);
    if (ids.length === 0) {
      setMessage("Select at least one chapter to generate.");
      return;
    }

    const titles = new Map(
      selectedBook.chapters.map((c) => [c.id, chapterDisplayLabel(c)])
    );

    setBulkGenerating(true);
    setMessage(`Starting lectures for ${ids.length} chapter(s)…`);

    try {
      const res = await api.generateLectures(ids, {
        lecture_language: lectureLanguage,
        lecture_persona: lecturePersona,
      });

      for (const chapterId of res.started_chapter_ids) {
        startPolling(chapterId, titles.get(chapterId) ?? `Chapter ${chapterId}`);
      }

      const skipped = res.results.filter((r) => r.status === "skipped");
      if (res.started_chapter_ids.length === 0) {
        setMessage("No chapters were started. Check that selected chapters have content.");
      } else if (skipped.length) {
        setMessage(
          `${res.message}. ${skipped.length} skipped (no content or not found).`
        );
      } else {
        setMessage(res.message);
      }

      setSelectedChapterIds(new Set());
      await loadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setBulkGenerating(false);
    }
  }

  async function saveChapter(chapter: Chapter, updates: { title?: string; content?: string }) {
    await api.updateChapter(chapter.id, updates);
    await loadBooks();
  }

  const selectableChapters =
    selectedBook?.chapters.filter((c) => c.content && c.status !== "generating") ?? [];

  return (
    <DashboardShell title="Books & Lectures" eyebrow="Book">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl p-6">
          <div className="mb-5 border-b border-white/[0.06] pb-4">
            <h2 className="text-base font-semibold tracking-tight text-slate-100">Add content</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload a complete book, or add individual chapters by typing context or uploading a
              chapter file.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAddMode("complete")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                addMode === "complete"
                  ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Complete book
            </button>
            <button
              type="button"
              onClick={() => setAddMode("individual")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                addMode === "individual"
                  ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              Individual chapter
            </button>
          </div>

          {addMode === "complete" ? (
          <form onSubmit={handleUpload} className="space-y-4">
            <ProgramPathPicker
              value={path}
              onChange={setPath}
              lockedProgram={adminProgram}
              lockedExamTrack={!isSchoolProgram(adminProgram) ? adminExamTrack : undefined}
            />
            <div className="space-y-1.5">
              <label className="section-label">Book title</label>
              <input
                className="input-field"
                placeholder={
                  files.length > 1
                    ? "Optional — used as the base title for each file"
                    : "Optional — auto-generated if empty"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="section-label">Your files</label>
              <input
                type="file"
                accept=".pdf,.docx,.doc"
                multiple
                className="input-field file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-200"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                required
              />
              {files.length > 0 && (
                <ul className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-slate-400">
                  {files.map((f) => (
                    <li key={`${f.name}-${f.size}`} className="truncate py-0.5">
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="submit" disabled={loading || files.length === 0} className="w-full rounded-lg">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadBatch.total > 1
                    ? `Uploading ${uploadBatch.current}/${uploadBatch.total}…`
                    : "Uploading…"}
                </>
              ) : (
                files.length > 1
                  ? `Add ${files.length} files to ${path.subject}`
                  : "Add book & organise lessons"
              )}
            </Button>
          </form>
          ) : (
          <form onSubmit={handleManualCreate} className="space-y-4">
            <ProgramPathPicker
              value={path}
              onChange={setPath}
              lockedProgram={adminProgram}
              lockedExamTrack={!isSchoolProgram(adminProgram) ? adminExamTrack : undefined}
            />
            <div className="space-y-1.5">
              <label className="section-label">Book / set title</label>
              <input
                className="input-field"
                placeholder="e.g. Class 10 Maths — Algebra set"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="section-label">Chapters</label>
                <button
                  type="button"
                  onClick={() => {
                    const nextNum =
                      String(
                        (manualChapters
                          .map((r) => Number(r.chapterNumber))
                          .filter((n) => Number.isFinite(n) && n > 0)
                          .sort((a, b) => a - b)
                          .pop() ?? 0) + 1
                      );
                    setManualChapters((prev) => [...prev, newManualChapterDraft(nextNum)]);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-slate-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add another
                </button>
              </div>

              {manualChapters.map((row, index) => (
                <div
                  key={row.id}
                  className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Chapter set {index + 1}
                    </p>
                    {manualChapters.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setManualChapters((prev) => prev.filter((item) => item.id !== row.id))
                        }
                        className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-rose-300"
                        title="Remove this chapter"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
                    <div className="space-y-1.5">
                      <label className="section-label">Chapter number</label>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        className="input-field"
                        placeholder="1"
                        value={row.chapterNumber}
                        onChange={(e) =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, chapterNumber: e.target.value }
                                : item
                            )
                          )
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="section-label">Chapter name</label>
                      <input
                        className="input-field"
                        placeholder="e.g. Real Numbers"
                        value={row.title}
                        onChange={(e) =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, title: e.target.value } : item
                            )
                          )
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="section-label">Content source</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    source: "context",
                                    fileName: "",
                                    extracting: false,
                                    sourceFilePath: "",
                                    sourceFileType: "",
                                    pdfPageCount: null,
                                  }
                                : item
                            )
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          row.source === "context"
                            ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
                            : "bg-white/5 text-slate-400 hover:bg-white/10"
                        }`}
                      >
                        Type context
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? { ...item, source: "upload", content: item.fileName ? item.content : "" }
                                : item
                            )
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          row.source === "upload"
                            ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
                            : "bg-white/5 text-slate-400 hover:bg-white/10"
                        }`}
                      >
                        Upload file
                      </button>
                    </div>
                  </div>

                  {row.source === "upload" ? (
                    <div className="space-y-2">
                      <label className="section-label">Chapter file (PDF / Word)</label>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc"
                        className="input-field file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-200"
                        onChange={(e) =>
                          void handleManualChapterFile(row.id, e.target.files?.[0] ?? null)
                        }
                      />
                      {row.extracting && (
                        <p className="flex items-center gap-2 text-xs text-amber-300/90">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Extracting text from {row.fileName || "file"}…
                        </p>
                      )}
                      {!row.extracting && row.fileName && (
                        <p className="text-xs text-slate-500">
                          Loaded from {row.fileName}. Review or edit the text below if needed.
                        </p>
                      )}
                      <textarea
                        className="input-field min-h-[120px] resize-y"
                        placeholder="Text from the uploaded file appears here…"
                        value={row.content}
                        onChange={(e) =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, content: e.target.value } : item
                            )
                          )
                        }
                        required={!row.extracting}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="section-label">Context / content</label>
                      <textarea
                        className="input-field min-h-[120px] resize-y"
                        placeholder="Paste or write the chapter text the lecture should teach from…"
                        value={row.content}
                        onChange={(e) =>
                          setManualChapters((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, content: e.target.value } : item
                            )
                          )
                        }
                        required
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              type="submit"
              disabled={
                loading ||
                manualChapters.length === 0 ||
                manualChapters.some((row) => row.extracting)
              }
              className="w-full rounded-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving chapters…
                </>
              ) : (
                `Create ${manualChapters.length} chapter${manualChapters.length === 1 ? "" : "s"}`
              )}
            </Button>
          </form>
          )}

          <UploadProgressPanel
            phase={uploadPhase}
            progress={uploadProgress}
            message={uploadStatusMessage}
            batchTotal={uploadBatch.total}
          />
          {message && uploadPhase === "idle" && (
            <p className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-300">
              {message}
            </p>
          )}
        </div>

        <div className="glass rounded-xl p-6">
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {(browseView.step === "books" ||
                  (browseView.step === "groups" && !isSchoolProgram(adminProgram))) && (
                    <button
                      type="button"
                      onClick={browseBack}
                      className="rounded-md border border-white/10 p-1.5 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                      title="Back"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                <h2 className="truncate text-base font-semibold tracking-tight text-slate-100">{browseTitle()}</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {browseView.step === "domains"
                  ? isSchoolProgram(adminProgram)
                    ? "Browse books by class."
                    : `Browse ${PROGRAM_SHORT[adminProgram]} curriculum by exam track.`
                  : browseView.step === "groups"
                    ? isSchoolProgram(adminProgram)
                      ? "Select a class to see its books."
                      : "Select an exam track."
                    : "Select a book to manage chapters, or delete with the trash icon."}
              </p>
            </div>
            <button
              onClick={() => loadBooks()}
              className="rounded-md border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="scroll-area max-h-[340px] space-y-1.5">
            {browseView.step === "domains" && (
              <div key="domains" className="picker-slide-up divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
                {domainSummaries.map((domain) => {
                  const Icon = DOMAIN_ICONS[domain.program];
                  return (
                    <button
                      key={domain.program}
                      type="button"
                      onClick={() => openDomain(domain.program)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                        <Icon className="h-4 w-4 text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-100">{PROGRAM_SHORT[domain.program]}</p>
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                            {domain.bookCount ?? 0} {(domain.bookCount ?? 0) === 1 ? "book" : "books"}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{domain.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                    </button>
                  );
                })}
              </div>
            )}

            {browseView.step === "groups" && (
              <div key={`groups-${browseView.program}`} className="picker-slide-up space-y-1.5">
                {browseGroups.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                    No content in this domain yet. Upload curriculum to get started.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
                    {browseGroups
                      .filter((group) => (group.bookCount ?? 0) > 0)
                      .map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => openGroup(browseView.program, group.key)}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <div className="min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{group.label}</p>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                              {group.bookCount ?? 0} {(group.bookCount ?? 0) === 1 ? "book" : "books"}
                            </span>
                          </div>
                          {group.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{group.description}</p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                      </button>
                    ))}
                  </div>
                )}
                {browseGroups.length > 0 &&
                  browseGroups.every((g) => (g.bookCount ?? 0) === 0) &&
                  PROGRAM_CATALOG[browseView.program].tracks.length > 0 && (
                    <p className="px-1 text-xs text-slate-600">
                      Exam tracks are listed above. Upload books to populate each track.
                    </p>
                  )}
              </div>
            )}

            {browseView.step === "books" && (
              <div key={`books-${browseView.program}-${browseView.groupKey}`} className="picker-slide-up space-y-1.5">
                {browseBooks.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                    No books in this section yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
                    {browseBooks.map((b) => (
                      <div
                        key={b.id}
                        className={`flex items-stretch transition-colors ${
                          selectedBook?.id === b.id ? "bg-indigo-500/[0.08]" : "hover:bg-white/[0.02]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectBook(b)}
                          className="min-w-0 flex-1 px-4 py-3.5 text-left"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{b.subject}</p>
                            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-200">
                              Book #{b.id}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-500">{b.title}</p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {b.status === "processing" ? (
                              <span className="inline-flex items-center gap-1 text-amber-400/90">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {b.chapters.length > 0
                                  ? `${b.chapters.length} chapter${b.chapters.length === 1 ? "" : "s"} · finishing…`
                                  : "Organising chapters…"}
                              </span>
                            ) : (
                              <>
                                {b.chapters.length} chapter{b.chapters.length === 1 ? "" : "s"}
                                {b.status === "ready" ? " · ready" : b.status ? ` · ${b.status}` : ""}
                              </>
                            )}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteBook(b, e)}
                          disabled={deletingBookId === b.id}
                          className="flex shrink-0 items-center px-3 text-slate-500 transition hover:text-red-400 disabled:opacity-50"
                          title={`Delete Book #${b.id} (${b.subject})`}
                        >
                          {deletingBookId === b.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showChaptersPanel && selectedBook && (
        <div className="glass mt-5 rounded-xl p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-100">
                Chapters — {selectedBook.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Select chapters with content, pick language and style, then create spoken classes.
              </p>
              {selectedBook.chapters.some(
                (chapter) => (chapter.content?.trim().length ?? 0) < 100
              ) && (
                <p className="mt-2 flex items-center gap-2 text-xs text-amber-400/90">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Some chapters are still loading text from the PDF. This page refreshes automatically.
                </p>
              )}
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-xl">
              <div>
                <label className="section-label">Class language</label>
                <select
                  className="input-field mt-1.5 w-full"
                  value={lectureLanguage}
                  onChange={(e) => {
                    languageUserOverride.current = true;
                    setLectureLanguage(e.target.value);
                  }}
                >
                  {LECTURE_LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {lectureLanguageFromBook(selectedBook) && (
                  <p className="mt-1 text-[11px] text-indigo-300/70">
                    Auto-detected from book: {languageLabel(lectureLanguageFromBook(selectedBook)!)}
                  </p>
                )}
              </div>
              <div>
                <label className="section-label">Teaching style</label>
                <select
                  className="input-field mt-1.5 w-full"
                  value={lecturePersona}
                  onChange={(e) => setLecturePersona(e.target.value)}
                >
                  {LECTURE_PERSONA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllChapters}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-200"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearChapterSelection}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-200"
            >
              Clear
            </button>
            <Button
              type="button"
              onClick={() => void generateSelectedLectures()}
              disabled={bulkGenerating || selectedChapterIds.size === 0}
              className="rounded-lg text-sm"
            >
              {bulkGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating classes…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create classes ({selectedChapterIds.size})
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            {selectedBook.chapters.map((ch) => (
              <ChapterCard
                key={ch.id}
                chapter={ch}
                selected={selectedChapterIds.has(ch.id)}
                onToggleSelect={() => toggleChapter(ch.id)}
                isGenerating={generatingChapterIds.has(ch.id)}
                canSelect={
                  Boolean(ch.content?.trim() && ch.content.trim().length >= 100) &&
                  ch.status !== "generating"
                }
                onSave={(u) => saveChapter(ch, u)}
              />
            ))}
            {!selectedBook.chapters.length && (
              <p className="text-sm text-slate-400">No chapters yet. Upload a book or add chapters manually.</p>
            )}
            {selectedBook.chapters.length > 0 && selectableChapters.length === 0 && (
              <p className="text-sm text-amber-300/90">
                All chapters are generating or have no content. Wait for in-progress jobs to finish.
              </p>
            )}
          </div>
        </div>
      )}

    </DashboardShell>
  );
}

function ChapterCard({
  chapter,
  selected,
  onToggleSelect,
  isGenerating,
  canSelect,
  onSave,
}: {
  chapter: Chapter;
  selected: boolean;
  onToggleSelect: () => void;
  isGenerating: boolean;
  canSelect: boolean;
  onSave: (u: { title?: string; content?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content || "");

  return (
    <div
      className={`relative rounded-lg border p-4 transition-colors ${
        isGenerating
          ? "border-indigo-500/30 bg-indigo-500/[0.04]"
          : selected
            ? "border-indigo-500/25 bg-indigo-500/[0.04]"
            : "border-white/[0.08] bg-white/[0.01]"
      }`}
    >
      {isGenerating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-slate-950/70">
          <div className="flex flex-col items-center gap-2 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            <p className="text-sm font-medium text-slate-200">Generating lecture…</p>
            <p className="text-xs text-slate-500">This may take several minutes</p>
          </div>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-start gap-3">
        <button
          type="button"
          onClick={onToggleSelect}
          disabled={!canSelect || isGenerating}
          className="mt-0.5 shrink-0 text-slate-400 disabled:cursor-not-allowed disabled:opacity-40 [&:not(:disabled):hover]:text-indigo-400"
          title={canSelect ? "Select for generation" : "Cannot select while generating or empty"}
        >
          {selected ? (
            <CheckSquare className="h-5 w-5" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">
            {chapterDisplayLabel(chapter)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
            chapter.status === "ready"
              ? "bg-emerald-500/10 text-emerald-400"
              : chapter.status === "generating"
                ? "bg-amber-500/10 text-amber-400"
                : chapter.status === "failed"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-white/[0.06] text-slate-500"
          }`}
        >
          {chapter.status}
        </span>
      </div>

      {editing ? (
        <div className="ml-8 space-y-2">
          <input
            className="input-field text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input-field min-h-24 text-sm"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button
            type="button"
            className="text-sm"
            onClick={() => {
              onSave({ title, content });
              setEditing(false);
            }}
          >
            Save chapter
          </Button>
        </div>
      ) : (
        <p className="mb-3 ml-8 line-clamp-2 text-xs text-slate-400">
          {chapter.content?.slice(0, 200) || "No content"}
        </p>
      )}

      <div className="ml-8">
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          disabled={isGenerating}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-200 disabled:opacity-50"
        >
          {editing ? "Cancel" : "Edit chapter"}
        </button>
      </div>

      {chapter.lecture_parts.length > 0 && (
        <div className="mt-3 ml-8 space-y-2 border-t border-white/5 pt-3">
          {chapter.lecture_parts.map((lp) => (
            <div key={lp.id} className="flex justify-between text-xs text-slate-400">
              <span>
                Part {lp.part_number}: {lp.title}
              </span>
              <span>
                ~{Math.max(0, Math.round(lp.duration_minutes))} min · {lp.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
