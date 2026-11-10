type ChapterLike = {
  chapter_number: number;
  source_chapter_number?: number | null;
  title: string;
  display_label?: string;
};

export function printedChapterNumber(chapter: ChapterLike): number {
  if (chapter.source_chapter_number != null && chapter.source_chapter_number > 0) {
    return chapter.source_chapter_number;
  }
  return chapter.chapter_number;
}

export function chapterDisplayLabel(chapter: ChapterLike): string {
  if (chapter.display_label?.trim()) return chapter.display_label.trim();
  const number = printedChapterNumber(chapter);
  if (number <= 0) {
    return chapter.title?.trim() || "Introduction";
  }
  return `Chapter ${number}: ${chapter.title}`;
}

export function chapterShortLabel(chapter: ChapterLike): string {
  const number = printedChapterNumber(chapter);
  if (number <= 0) return "Introduction";
  return `Chapter ${number}`;
}

/** Find a chapter in a book by the printed textbook chapter number. */
export function findChapterByPrintedNumber<T extends ChapterLike & { id: number }>(
  chapters: T[],
  printedNumber: number
): T | undefined {
  const exact = chapters.find((ch) => printedChapterNumber(ch) === printedNumber);
  if (exact) return exact;
  return chapters.find((ch) => ch.chapter_number === printedNumber);
}
