export const LECTURE_LANGUAGE_KEY = "vidyaai_lecture_language";
export const LECTURE_PERSONA_KEY = "vidyaai_lecture_persona";

export const LECTURE_LANGUAGE_OPTIONS = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish (Hindi + English mix)" },
  { value: "french", label: "French" },
  { value: "urdu", label: "Urdu" },
  { value: "sanskrit", label: "Sanskrit" },
  { value: "marathi", label: "Marathi" },
] as const;

export type LectureLanguageValue = (typeof LECTURE_LANGUAGE_OPTIONS)[number]["value"];

export const LECTURE_PERSONA_OPTIONS = [
  { value: "warm", label: "Warm & caring" },
  { value: "happy", label: "Cheerful & upbeat" },
  { value: "calm", label: "Calm & steady" },
  { value: "energetic", label: "Energetic & lively" },
] as const;

/** Map book.content_language BCP codes → lecture dropdown value. */
const CONTENT_CODE_TO_LECTURE: Record<string, LectureLanguageValue> = {
  "en-IN": "english",
  en: "english",
  "hi-IN": "hindi",
  hi: "hindi",
  "fr-FR": "french",
  fr: "french",
  "ur-IN": "urdu",
  ur: "urdu",
  "sa-IN": "sanskrit",
  sa: "sanskrit",
  "mr-IN": "marathi",
  mr: "marathi",
};

const SUBJECT_HINTS: Array<[string, LectureLanguageValue]> = [
  ["hindi", "hindi"],
  ["हिंदी", "hindi"],
  ["हिन्दी", "hindi"],
  ["sanskrit", "sanskrit"],
  ["संस्कृत", "sanskrit"],
  ["urdu", "urdu"],
  ["اردو", "urdu"],
  ["marathi", "marathi"],
  ["मराठी", "marathi"],
  ["french", "french"],
  ["français", "french"],
  ["francais", "french"],
];

export function lectureLanguageFromBook(book: {
  content_language?: string | null;
  subject?: string | null;
} | null | undefined): LectureLanguageValue | null {
  if (!book) return null;
  const subject = (book.subject || "").toLowerCase();
  for (const [hint, value] of SUBJECT_HINTS) {
    if (subject.includes(hint.toLowerCase())) return value;
  }
  const code = (book.content_language || "").trim();
  if (!code) return null;
  if (CONTENT_CODE_TO_LECTURE[code]) return CONTENT_CODE_TO_LECTURE[code];
  const base = code.split("-")[0];
  return CONTENT_CODE_TO_LECTURE[base] ?? null;
}

export function loadLectureLanguage(): string {
  if (typeof window === "undefined") return "english";
  return localStorage.getItem(LECTURE_LANGUAGE_KEY) || "english";
}

export function loadLecturePersona(): string {
  if (typeof window === "undefined") return "warm";
  return localStorage.getItem(LECTURE_PERSONA_KEY) || "warm";
}

export function saveLecturePreferences(language: string, persona: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LECTURE_LANGUAGE_KEY, language);
  localStorage.setItem(LECTURE_PERSONA_KEY, persona);
}

export function personaLabel(value: string): string {
  return LECTURE_PERSONA_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function languageLabel(value: string): string {
  return LECTURE_LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
