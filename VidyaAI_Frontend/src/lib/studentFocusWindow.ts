const PRACTICE_PAPER_KEY = "vidyaai_practice_paper";

/** Navigate in the same tab (no popup window). */
export function openStudentFocusWindow(path: string): void {
  if (typeof window === "undefined") return;
  const target = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(target);
}

export function stashPracticePaper(paper: import("@/types").PracticePaper): void {
  sessionStorage.setItem(PRACTICE_PAPER_KEY, JSON.stringify(paper));
}

export function readStashedPracticePaper(paperId: number): import("@/types").PracticePaper | null {
  try {
    const raw = sessionStorage.getItem(PRACTICE_PAPER_KEY);
    if (!raw) return null;
    const paper = JSON.parse(raw) as import("@/types").PracticePaper;
    return paper.id === paperId ? paper : null;
  } catch {
    return null;
  }
}

export function clearStashedPracticePaper(): void {
  sessionStorage.removeItem(PRACTICE_PAPER_KEY);
}
