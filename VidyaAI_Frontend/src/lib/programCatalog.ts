import type { Program } from "./programs";
import { normalizeProgram, PROGRAMS } from "./programs";

export type ExamTrack = {
  id: string;
  label: string;
  description: string;
  subjects: string[];
};

export type ProgramDefinition = {
  label: string;
  short: string;
  description: string;
  accent: string;
  needsClass: boolean;
  /** Single track programs (NEET) auto-select this track */
  tracks: ExamTrack[];
};

export const PROGRAM_CATALOG: Record<Program, ProgramDefinition> = {
  school: {
    label: "School (Class 1–12)",
    short: "School",
    description: "NCERT & board curriculum by class",
    accent: "from-indigo-500 to-violet-600",
    needsClass: true,
    tracks: [],
  },
  neet: {
    label: "NEET",
    short: "NEET",
    description: "Medical entrance — PCB focus",
    accent: "from-emerald-500 to-teal-600",
    needsClass: false,
    tracks: [
      {
        id: "medical",
        label: "Medical (NEET UG)",
        description: "Physics, Chemistry, Biology for medical aspirants",
        subjects: ["Physics", "Chemistry", "Biology"],
      },
    ],
  },
  jee: {
    label: "JEE",
    short: "JEE",
    description: "Engineering entrance — two phases",
    accent: "from-orange-500 to-amber-600",
    needsClass: false,
    tracks: [
      {
        id: "mains",
        label: "JEE Main",
        description: "PCM for JEE Main & board-aligned prep",
        subjects: ["Physics", "Chemistry", "Mathematics"],
      },
      {
        id: "advanced",
        label: "JEE Advanced",
        description: "Higher difficulty PCM for IIT entrance",
        subjects: ["Physics", "Chemistry", "Mathematics"],
      },
    ],
  },
  govt: {
    label: "Govt Exams",
    short: "Govt",
    description: "UPSC, SSC, Banking, Railway & more",
    accent: "from-rose-500 to-pink-600",
    needsClass: false,
    tracks: [
      {
        id: "upsc",
        label: "UPSC Civil Services",
        description: "Prelims & Mains — GS, optional subjects",
        subjects: [
          "History",
          "Geography",
          "Polity",
          "Economy",
          "Environment",
          "General Studies",
        ],
      },
      {
        id: "ssc_cgl",
        label: "SSC CGL",
        description: "Tier 1 & 2 — Quant, Reasoning, English, GA",
        subjects: [
          "Quantitative Aptitude",
          "Reasoning",
          "English",
          "General Awareness",
        ],
      },
      {
        id: "ssc_chsl",
        label: "SSC CHSL / MTS",
        description: "10+2 level staff selection",
        subjects: [
          "Quantitative Aptitude",
          "Reasoning",
          "English",
          "General Awareness",
        ],
      },
      {
        id: "railway",
        label: "Railway (RRB)",
        description: "NTPC, Group D, ALP & technical posts",
        subjects: [
          "Mathematics",
          "Reasoning",
          "General Science",
          "General Awareness",
        ],
      },
      {
        id: "banking",
        label: "Banking (IBPS / SBI)",
        description: "PO, Clerk, SO examinations",
        subjects: [
          "Quantitative Aptitude",
          "Reasoning",
          "English",
          "Banking Awareness",
        ],
      },
      {
        id: "state_psc",
        label: "State PSC",
        description: "State-level civil services & combined exams",
        subjects: [
          "History",
          "Polity",
          "Geography",
          "General Studies",
          "State GK",
        ],
      },
    ],
  },
};

export const SCHOOL_SUBJECTS = [
  "Mathematics",
  "Science",
  "English",
  "Hindi",
  "Social Studies",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
];

export type ProgramPathValue = {
  program: Program;
  examTrack: string;
  classGrade: number;
  subject: string;
};

export function getTrack(program: Program, examTrackId: string): ExamTrack | undefined {
  return PROGRAM_CATALOG[program].tracks.find((t) => t.id === examTrackId);
}

export function getSubjectsForPath(program: Program, examTrackId: string, classGrade?: number): string[] {
  if (program === "school") return SCHOOL_SUBJECTS;
  const track = getTrack(program, examTrackId);
  return track?.subjects ?? [];
}

export function formatPathLabel(program: Program, examTrackId: string, classGrade?: number): string {
  const def = PROGRAM_CATALOG[program];
  if (program === "school") return `Class ${classGrade ?? ""}`.trim();
  const track = getTrack(program, examTrackId);
  return track ? `${def.short} · ${track.label}` : def.short;
}

export function defaultExamTrack(program: Program): string {
  if (program === "school") return "";
  return PROGRAM_CATALOG[program].tracks[0]?.id ?? "";
}

export function defaultSubject(program: Program, examTrackId: string): string {
  return getSubjectsForPath(program, examTrackId)[0] ?? "";
}

export type DomainGroup = {
  key: string;
  label: string;
  description?: string;
  bookCount?: number;
  studentCount?: number;
};

export type DomainSummary = {
  program: Program;
  label: string;
  description: string;
  accent: string;
  bookCount: number;
  groupCount: number;
};

export function bookProgram(book: { program?: string | null }): Program {
  return normalizeProgram(book.program ?? "school");
}

export function summarizeDomains(books: { program?: string | null; class_grade?: number; exam_track?: string | null }[]): DomainSummary[] {
  return PROGRAMS.map((program) => {
    const def = PROGRAM_CATALOG[program];
    const domainBooks = books.filter((b) => bookProgram(b) === program);
    const groups = listDomainGroups(program, books);
    return {
      program,
      label: def.label,
      description: def.description,
      accent: def.accent,
      bookCount: domainBooks.length,
      groupCount: groups.length,
    };
  });
}

export function listDomainGroups(
  program: Program,
  books: { program?: string | null; class_grade?: number; exam_track?: string | null }[]
): DomainGroup[] {
  const domainBooks = books.filter((b) => bookProgram(b) === program);

  if (program === "school") {
    const grades = [...new Set(domainBooks.map((b) => b.class_grade).filter((g): g is number => (g ?? 0) > 0))].sort(
      (a, b) => a - b
    );
    return grades.map((grade) => ({
      key: String(grade),
      label: `Class ${grade}`,
      bookCount: domainBooks.filter((b) => b.class_grade === grade).length,
    }));
  }

  const groups: DomainGroup[] = [];
  for (const track of PROGRAM_CATALOG[program].tracks) {
    groups.push({
      key: track.id,
      label: track.label,
      description: track.description,
      bookCount: domainBooks.filter(
        (b) => (b.exam_track || defaultExamTrack(program)) === track.id
      ).length,
    });
  }

  const known = new Set(PROGRAM_CATALOG[program].tracks.map((t) => t.id));
  const otherTracks = [
    ...new Set(domainBooks.map((b) => b.exam_track).filter((t): t is string => Boolean(t && !known.has(t)))),
  ];
  for (const trackId of otherTracks) {
    groups.push({
      key: trackId,
      label: trackId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      bookCount: domainBooks.filter((b) => b.exam_track === trackId).length,
    });
  }

  return groups;
}

export function booksInDomainGroup<T extends { program?: string | null; class_grade?: number; exam_track?: string | null }>(
  books: T[],
  program: Program,
  groupKey: string
): T[] {
  const domainBooks = books.filter((b) => bookProgram(b) === program);
  if (program === "school") {
    return domainBooks.filter((b) => b.class_grade === Number(groupKey));
  }
  return domainBooks.filter((b) => (b.exam_track || defaultExamTrack(program)) === groupKey);
}

/** One library entry per subject — keeps the book with the most chapters. */
export function canonicalBooksBySubject<T extends { subject: string; chapters?: unknown[]; id: number }>(
  books: T[]
): T[] {
  const bySubject = new Map<string, T>();
  for (const book of books) {
    const key = book.subject.trim().toLowerCase();
    const existing = bySubject.get(key);
    const chapterCount = book.chapters?.length ?? 0;
    const existingCount = existing?.chapters?.length ?? 0;
    if (
      !existing ||
      chapterCount > existingCount ||
      (chapterCount === existingCount && book.id < existing.id)
    ) {
      bySubject.set(key, book);
    }
  }
  return Array.from(bySubject.values()).sort((a, b) => a.subject.localeCompare(b.subject));
}

export function bookBrowseLabel(book: {
  program?: string | null;
  class_grade?: number;
  exam_track?: string | null;
  subject: string;
  title: string;
}): string {
  const program = bookProgram(book);
  if (program === "school") return `Class ${book.class_grade} · ${book.subject}`;
  const track = getTrack(program, book.exam_track ?? defaultExamTrack(program));
  return track ? `${track.label} · ${book.subject}` : `${book.subject}`;
}

function studentProgram(student: { program?: string | null }): Program {
  return normalizeProgram(student.program);
}

export type StudentDomainSummary = {
  program: Program;
  label: string;
  description: string;
  accent: string;
  studentCount: number;
  groupCount: number;
};

export function summarizeStudentDomains(
  students: { program?: string | null; class_grade?: number | null; exam_track?: string | null }[]
): StudentDomainSummary[] {
  return PROGRAMS.map((program) => {
    const def = PROGRAM_CATALOG[program];
    const domainStudents = students.filter((s) => studentProgram(s) === program);
    const groups = listStudentDomainGroups(program, students);
    return {
      program,
      label: def.label,
      description: def.description,
      accent: def.accent,
      studentCount: domainStudents.length,
      groupCount: groups.filter((g) => (g.studentCount ?? 0) > 0).length,
    };
  });
}

export function listStudentDomainGroups(
  program: Program,
  students: { program?: string | null; class_grade?: number | null; exam_track?: string | null }[]
): DomainGroup[] {
  const domainStudents = students.filter((s) => studentProgram(s) === program);

  if (program === "school") {
    const grades = [
      ...new Set(domainStudents.map((s) => s.class_grade).filter((g): g is number => (g ?? 0) > 0)),
    ].sort((a, b) => a - b);
    return grades.map((grade) => ({
      key: String(grade),
      label: `Class ${grade}`,
      studentCount: domainStudents.filter((s) => s.class_grade === grade).length,
    }));
  }

  const groups: DomainGroup[] = [];
  for (const track of PROGRAM_CATALOG[program].tracks) {
    groups.push({
      key: track.id,
      label: track.label,
      description: track.description,
      studentCount: domainStudents.filter(
        (s) => (s.exam_track || defaultExamTrack(program)) === track.id
      ).length,
    });
  }

  const known = new Set(PROGRAM_CATALOG[program].tracks.map((t) => t.id));
  const otherTracks = [
    ...new Set(
      domainStudents
        .map((s) => s.exam_track)
        .filter((t): t is string => Boolean(t && !known.has(t)))
    ),
  ];
  for (const trackId of otherTracks) {
    groups.push({
      key: trackId,
      label: trackId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      studentCount: domainStudents.filter((s) => s.exam_track === trackId).length,
    });
  }

  return groups;
}

export function studentsInDomainGroup<T extends { program?: string | null; class_grade?: number | null; exam_track?: string | null }>(
  students: T[],
  program: Program,
  groupKey: string
): T[] {
  const domainStudents = students.filter((s) => studentProgram(s) === program);
  if (groupKey === "*") {
    return domainStudents;
  }
  if (program === "school") {
    return domainStudents.filter((s) => s.class_grade === Number(groupKey));
  }
  return domainStudents.filter((s) => (s.exam_track || defaultExamTrack(program)) === groupKey);
}

/** School and Govt use class/exam sub-groups; JEE & NEET list all students under the domain. */
export function studentDomainUsesGroups(program: Program): boolean {
  return program === "school" || program === "govt";
}
