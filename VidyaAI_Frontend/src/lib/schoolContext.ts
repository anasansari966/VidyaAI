const SCHOOL_CTX_KEY = "vidyaai_school_context";

export function getSchoolContextId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SCHOOL_CTX_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function setSchoolContextId(id: number | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(SCHOOL_CTX_KEY, String(id));
  else localStorage.removeItem(SCHOOL_CTX_KEY);
}

export function appendSchoolId(path: string, schoolId?: number | null): string {
  const id = schoolId ?? getSchoolContextId();
  if (!id) return path;
  const url = new URL(path, "http://local");
  url.searchParams.set("school_id", String(id));
  return `${url.pathname}${url.search}`;
}

export function adminPathRequiresSchool(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard/admin/") &&
    pathname !== "/dashboard/admin"
  );
}
