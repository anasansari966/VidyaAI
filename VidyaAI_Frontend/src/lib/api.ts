import type { AccessRole, Book, DemoLead, PlatformOverview, School, ServicePermission, StudentLead, User, UserRole } from "@/types";
import { appendSchoolId, getSchoolContextId } from "@/lib/schoolContext";

const API_ROOT = `/${(process.env.NEXT_PUBLIC_API_ROOT || "vidyaai")
  .trim()
  .replace(/^\/+|\/+$/g, "")}`;

const TOKEN_KEY = "vidyaai_token";
const REFRESH_TOKEN_KEY = "vidyaai_refresh_token";
const USER_KEY = "vidyaai_user";
const LEGACY_TOKEN_KEY = "eduverse_token";
const LEGACY_USER_KEY = "eduverse_user";
const SIDEBAR_OPEN_KEY = "vidyaai_sidebar_open";

let refreshInFlight: Promise<boolean> | null = null;

/** Strip placeholder text and ensure an absolute backend origin (no trailing slash). */
function normalizeApiBaseUrl(raw: string | undefined): string {
  const fallback = "http://localhost:8002";
  if (!raw?.trim()) return fallback;

  // Hosting panels sometimes store an entire .env block in one variable.
  let value = raw.trim().split(/[\r\n]+/)[0].trim();
  value = value.split(/NEXT_PUBLIC/i)[0].trim();
  value = value.split("#")[0].trim();

  const originMatch = value.match(/^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?/i);
  if (originMatch) {
    return originMatch[0].replace(/\/$/, "");
  }

  const embedded = value.match(/https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?/i);
  if (embedded) {
    return embedded[0].replace(/\/$/, "");
  }

  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }

  console.warn(
    "NEXT_PUBLIC_API_URL must be a single absolute URL (e.g. http://localhost:8002). Using localhost."
  );
  return fallback;
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function isBrowserLocalDev(): boolean {
  return typeof window !== "undefined" && isLocalDevHost(window.location.hostname);
}

function isBrowserLanDev(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return isLocalDevHost(hostname) && !["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function configuredApiUsesLocalHost(): boolean {
  try {
    return isLocalDevHost(new URL(apiOrigin()).hostname);
  } catch {
    return false;
  }
}

function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function apiOrigin(): string {
  return normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
}

/** Direct backend origin for server-side calls and Next.js rewrite target. */
function localApiOrigin(): string {
  const fromEnv = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)) {
    return fromEnv;
  }
  return "http://localhost:8002";
}

/** Same host as NEXT_PUBLIC_SITE_URL — nginx/Next must proxy /vidyaai to the API. */
function shouldUseSameOriginApi(): boolean {
  if (typeof window === "undefined") return false;
  if (isBrowserLanDev()) return true;
  if (isLocalDevHost(window.location.hostname)) return false;
  // A deployed browser cannot call localhost/private network addresses from
  // NEXT_PUBLIC_API_URL. In that case, use the app's /vidyaai proxy.
  if (configuredApiUsesLocalHost()) return true;
  const site = siteOrigin();
  return Boolean(site && site === window.location.origin);
}

/** Origin for paths that already include `/vidyaai` (audio, images). Empty = same-origin. */
function getApiBaseUrl(): string {
  if (shouldUseSameOriginApi()) {
    return "";
  }
  if (isBrowserLocalDev()) {
    return localApiOrigin();
  }
  return apiOrigin();
}

function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (shouldUseSameOriginApi()) {
    return `${API_ROOT}${normalized}`;
  }
  return `${apiOrigin()}${API_ROOT}${normalized}`;
}

/**
 * Loopback dev (browser): direct backend URL.
 * LAN dev (phone/tablet): same-origin proxy so `localhost` never points at the device.
 * Local dev (SSR): direct backend URL.
 * Production same-domain: /vidyaai/* (nginx proxy).
 * Production split-domain: absolute NEXT_PUBLIC_API_URL.
 */
function resolveRequestUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (shouldUseSameOriginApi()) {
    return `${API_ROOT}${normalized}`;
  }
  if (isBrowserLocalDev()) {
    return `${localApiOrigin()}${API_ROOT}${normalized}`;
  }
  if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
    return `${localApiOrigin()}${API_ROOT}${normalized}`;
  }
  return apiUrl(path);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getSidebarOpenPreference(defaultOpen = true): boolean {
  if (typeof window === "undefined") return defaultOpen;
  const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
  if (stored === null) return defaultOpen;
  return stored === "1";
}

export function setSidebarOpenPreference(open: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_OPEN_KEY, open ? "1" : "0");
}

function parseApiErrorMessage(detail: unknown, fallback = "Request failed"): string {
  if (typeof detail === "string") return detail.trim() || fallback;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (!item || typeof item !== "object") return fallback;
      const entry = item as { msg?: string; loc?: Array<string | number> };
      const field = entry.loc?.filter((part) => part !== "body").join(".") ?? "";
      const msg = entry.msg ?? "Invalid value";
      return field ? `${field}: ${msg}` : msg;
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

function isGenericServerMessage(message: string): boolean {
  return /^(internal server error|request failed|error|bad gateway|service unavailable)$/i.test(
    message.trim()
  );
}

function enrichApiErrorMessage(path: string, status: number, message: string): string {
  if (status === 503 && message.toLowerCase().includes("database")) {
    return message;
  }
  if (status === 503) {
    if (!isGenericServerMessage(message)) {
      return message;
    }
    return "Service temporarily unavailable. Check that the backend is running and connected to the database.";
  }
  if (status === 502 || status === 504) {
    if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
      return `Cannot reach the API (${status}). Start VidyaAI_FastAPI on port 8002.`;
    }
    return `API gateway error (${status}) on ${path}. Please try again.`;
  }
  if (status >= 500 && isGenericServerMessage(message)) {
    if (typeof window !== "undefined" && isLocalDevHost(window.location.hostname)) {
      return `Server error on ${path}. Check the backend terminal for the full traceback.`;
    }
    return `Server error on ${path}. Please try again or contact support.`;
  }
  return message;
}

async function readApiErrorDetail(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await res.json()) as { detail?: unknown; message?: unknown };
      return body.detail ?? body.message ?? body;
    }
    const text = (await res.text()).trim();
    if (!text) return res.statusText;
    try {
      const body = JSON.parse(text) as { detail?: unknown; message?: unknown };
      return body.detail ?? body.message ?? text;
    } catch {
      return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || res.statusText;
    }
  } catch {
    return res.statusText;
  }
}

export class ApiError extends Error {
  status: number;
  path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

async function throwApiError(path: string, res: Response): Promise<never> {
  const detail = await readApiErrorDetail(res);
  const parsed = parseApiErrorMessage(detail, res.statusText || "Request failed");
  const message = enrichApiErrorMessage(path, res.status, parsed);
  throw new ApiError(message, res.status, path);
}

function jsonBody(data: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== null))
  );
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(path, { ...options, headers: { ...(options.headers || {}), "X-Public-Request": "1" } });
}

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(resolveRequestUrl("/api/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string | null;
        user: User;
      };
      saveSession(data.access_token, data.user, data.refresh_token ?? refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  allowRefresh = true
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.headers || {}),
  };
  const isPublic = (headers as Record<string, string>)["X-Public-Request"] === "1";
  if (isPublic) {
    delete (headers as Record<string, string>)["X-Public-Request"];
  }

  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  if (token && !isPublic) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(resolveRequestUrl(path), { ...options, headers });
  } catch {
    const devHint =
      typeof window !== "undefined" && isLocalDevHost(window.location.hostname)
        ? " Start VidyaAI_FastAPI on port 8002."
        : " Check your network connection.";
    throw new ApiError(`Network error calling ${path}.${devHint}`, 0, path);
  }

  if (
    res.status === 401 &&
    allowRefresh &&
    !isPublic &&
    typeof window !== "undefined" &&
    !path.includes("/api/auth/login") &&
    !path.includes("/api/auth/refresh") &&
    !path.includes("/api/auth/register")
  ) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(path, options, false);
    }
    clearSession();
  } else if (res.status === 401 && !isPublic && typeof window !== "undefined") {
    clearSession();
  }

  if (!res.ok) {
    await throwApiError(path, res);
  }

  return res.json();
}

async function downloadFileResponse(
  path: string,
  options: RequestInit = {},
  fallbackName: string
): Promise<{ filename: string; warnings: string[]; importedCount: number | null }> {
  const token = getToken();
  const headers: HeadersInit = { ...(options.headers || {}) };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(resolveRequestUrl(path), { ...options, headers });
  } catch {
    throw new ApiError(`Network error downloading ${path}.`, 0, path);
  }
  if (!res.ok) {
    await throwApiError(path, res);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const filename = disposition?.match(/filename=\"?([^\";]+)\"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);

  const warningsHeader = res.headers.get("X-Import-Warnings");
  const importCountHeader = res.headers.get("X-Import-Count");
  return {
    filename,
    warnings: warningsHeader ? warningsHeader.split("; ").filter(Boolean) : [],
    importedCount: importCountHeader ? Number(importCountHeader) : null,
  };
}

export const api = {
  ping: () => request<{ status: string }>("/ping"),
  health: () => request<{ status: string; openai_configured: boolean }>("/api/health"),

  submitDemoLead: (data: {
    full_name: string;
    email: string;
    phone: string;
    organization: string;
    role: string;
    program: string;
    student_count?: string;
    message?: string;
  }) =>
    request<{ id: number; full_name: string; email: string; message: string | null; created_at: string }>(
      "/api/leads/demo",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token?: string | null; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  superAdminAvailable: () =>
    request<{ available: boolean }>("/api/auth/super-admin-available"),

  register: (data: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
    school_id?: number;
    program?: string;
    exam_track?: string;
    class_grade?: number;
  }) =>
    request<{ access_token: string; refresh_token?: string | null; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: () => request<User>("/api/auth/me"),

  billingPlans: (cycle = "monthly") =>
    request<{
      country: string;
      currency: string;
      note: string;
      billing_cycle: string;
      cycles: {
        id: string;
        label: string;
        short_label: string;
        months: number;
        days: number;
        discount_percent: number;
      }[];
      plans: {
        id: string;
        name: string;
        tagline: string;
        price_inr: number;
        monthly_inr: number;
        list_price_inr: number;
        savings_inr: number;
        discount_percent: number;
        per_month_inr: number;
        billing_cycle: string;
        cycle_label: string;
        months: number;
        days: number;
        currency: string;
        period: string;
        country: string;
        highlighted: boolean;
        features: string[];
      }[];
      razorpay_configured: boolean;
      smtp_configured?: boolean;
      dev_bypass: boolean;
      key_id: string | null;
    }>(`/api/billing/plans?cycle=${encodeURIComponent(cycle)}`),

  registerIndividualStudent: (data: {
    plan_id: string;
    billing_cycle?: string;
    email: string;
    password: string;
    full_name: string;
    class_grade: number;
    phone: string;
    parent_name: string;
    parent_phone: string;
    school_name: string;
    city: string;
    board: string;
  }) =>
    request<{
      user_id: number;
      email: string;
      needs_otp: boolean;
      checkout_token: string | null;
      otp_expires_in: number | null;
      message: string;
    }>("/api/billing/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  verifyRegisterOtp: (data: { email: string; otp: string }) =>
    request<{
      user_id: number;
      email: string;
      needs_otp: boolean;
      checkout_token: string | null;
      message: string;
    }>("/api/billing/register/verify-otp", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resendRegisterOtp: (email: string) =>
    request<{
      email: string;
      needs_otp: boolean;
      checkout_token?: string | null;
      otp_expires_in?: number | null;
      message: string;
    }>("/api/billing/register/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  billingCheckoutStart: (data: {
    plan_id: string;
    billing_cycle?: string;
    checkout_token?: string;
    email?: string;
    password?: string;
  }) =>
    request<{
      payment_id: number;
      order_id: string;
      amount: number;
      currency: string;
      key_id: string;
      billing_cycle?: string;
      plan: { id: string; name: string; price_inr: number; cycle_label?: string };
      dev_bypass: boolean;
      user_id: number;
      prefill: { name: string; email: string; contact: string };
    }>("/api/billing/checkout/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  billingCheckoutVerify: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) =>
    request<{ access_token: string; refresh_token?: string | null; user: User }>(
      "/api/billing/checkout/verify",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  schools: () => request<School[]>("/api/schools/public"),

  adminSchools: () => request<School[]>("/api/schools"),

  createSchool: (data: {
    name: string;
    organization_type: string;
    default_access_role_id: number;
    address?: string;
    enabled_class_grades?: number[];
    student_limits?: Record<number, number>;
  }) =>
    request<School>("/api/schools", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createAdmin: (
    schoolId: number,
    data: {
      email: string;
      password: string;
      full_name: string;
      role: "admin";
      program?: string;
      exam_track?: string;
    }
  ) =>
    request<User>(`/api/schools/${schoolId}/admins`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  platformOverview: () => request<PlatformOverview>("/api/platform/overview"),

  platformUsers: (params?: { school_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.school_id) q.set("school_id", String(params.school_id));
    const qs = q.toString();
    return request<User[]>(`/api/platform/users${qs ? `?${qs}` : ""}`);
  },

  accessRoles: () => request<AccessRole[]>("/api/access-roles"),

  accessRoleOptions: () =>
    request<Array<{ key: ServicePermission; label: string }>>("/api/access-roles/options"),

  createAccessRole: (data: { name: string; description?: string; permissions: ServicePermission[] }) =>
    request<AccessRole>("/api/access-roles", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateAccessRole: (
    roleId: number,
    data: { name?: string; description?: string; permissions?: ServicePermission[] }
  ) =>
    request<AccessRole>(`/api/access-roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteAccessRole: (roleId: number) =>
    request<{ message: string; role_id: number }>(`/api/access-roles/${roleId}`, {
      method: "DELETE",
    }),

  updatePlatformUserStatus: (
    userId: number,
    data: {
      account_status: "active" | "suspended" | "service_stopped";
      status_note?: string;
    }
  ) =>
    request<User>(`/api/platform/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deletePlatformUser: (userId: number) =>
    request<{ message: string; user_id: number; students_blocked: number }>(
      `/api/platform/users/${userId}`,
      {
        method: "DELETE",
      }
    ),

  updateSchool: (
    schoolId: number,
    data: {
      name?: string;
      organization_type?: string;
      default_access_role_id?: number | null;
      address?: string;
      enabled_class_grades?: number[];
      student_limits?: Record<number, number>;
    }
  ) =>
    request<School>(`/api/platform/schools/${schoolId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteSchool: (schoolId: number) =>
    request<{
      message: string;
      school_id: number;
      users_removed: number;
      books_removed: number;
    }>(`/api/platform/schools/${schoolId}`, {
      method: "DELETE",
    }),

  demoLeads: () => request<DemoLead[]>("/api/leads/demo"),

  updateDemoLead: (
    leadId: number,
    data: { status?: DemoLead["status"]; admin_notes?: string }
  ) =>
    request<DemoLead>(`/api/leads/demo/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  studentLeads: () => request<StudentLead[]>("/api/leads/students"),

  updateStudentLead: (
    leadId: number,
    data: { status?: StudentLead["status"]; admin_notes?: string }
  ) =>
    request<StudentLead>(`/api/leads/students/${leadId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  analytics: () => request<Record<string, unknown>>("/api/analytics/dashboard"),

  myPerformance: () =>
    request<import("@/types").MyStudentPerformanceAnalytics>("/api/analytics/my-performance"),

  parentChildren: () => request<User[]>("/api/parent/children"),

  parentChildPerformance: (studentId: number) =>
    request<import("@/types").MyStudentPerformanceAnalytics>(
      `/api/parent/children/${studentId}/performance`
    ),

  parentChildReports: (studentId: number) =>
    request<
      {
        paper_id: number;
        title: string;
        subject: string;
        plan_type: string;
        plan_label: string;
        score: number;
        total: number;
        percent: number;
        status: string;
        submitted_at: string | null;
        has_pdf: boolean;
      }[]
    >(`/api/parent/children/${studentId}/reports`),

  openParentReportPdf: async (studentId: number, paperId: number, mode: "view" | "download" = "view") => {
    const token = getToken();
    const res = await fetch(apiUrl(`/api/parent/children/${studentId}/reports/${paperId}/pdf`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "Failed to open report PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = `vidyaai-report-${studentId}-${paperId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  adminStudentRecords: (params?: { classGrade?: number; unassigned?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.unassigned) q.set("unassigned", "true");
    else if (params?.classGrade != null) q.set("class_grade", String(params.classGrade));
    const qs = q.toString();
    return request<
      {
        student_id: number;
        full_name: string;
        email: string;
        program: string;
        exam_track?: string | null;
        class_grade?: number | null;
        avg_score: number;
        attempts: number;
        best_mock_score: number | null;
        last_submitted_at: string | null;
      }[]
    >(`/api/students/performance-records${qs ? `?${qs}` : ""}`);
  },

  adminRecordClasses: () =>
    request<
      {
        class_grade: number | null;
        key: string;
        label: string;
        student_count: number;
        attempted_count: number;
        class_avg: number;
        top_student: string | null;
        top_score: number | null;
      }[]
    >("/api/students/performance-records/classes"),

  openAdminClassRecordsPdf: async (classKey: string, mode: "view" | "download" = "view") => {
    const token = getToken();
    const res = await fetch(apiUrl(`/api/students/performance-records/class/${classKey}/pdf`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "Failed to open class PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = `vidyaai-class-records-${classKey}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  adminStudentPerformance: (studentId: number) =>
    request<import("@/types").MyStudentPerformanceAnalytics>(`/api/students/${studentId}/performance`),

  adminStudentReports: (studentId: number) =>
    request<
      {
        paper_id: number;
        title: string;
        subject: string;
        plan_type: string;
        plan_label: string;
        score: number;
        total: number;
        percent: number;
        status: string;
        submitted_at: string | null;
        has_pdf: boolean;
      }[]
    >(`/api/students/${studentId}/reports`),

  openAdminStudentPdf: async (
    studentId: number,
    target: { kind: "overall" } | { kind: "paper"; paperId: number },
    mode: "view" | "download" = "view"
  ) => {
    const token = getToken();
    const path =
      target.kind === "overall"
        ? `/api/students/${studentId}/reports/overall/pdf`
        : `/api/students/${studentId}/reports/${target.paperId}/pdf`;
    const res = await fetch(apiUrl(path), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || "Failed to open report PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const filename =
      target.kind === "overall"
        ? `vidyaai-overall-${studentId}.pdf`
        : `vidyaai-report-${studentId}-${target.paperId}.pdf`;
    if (mode === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  studentPerformance: (schoolId?: number) =>
    request<import("@/types").StudentPerformanceAnalytics>(
      appendSchoolId("/api/analytics/student-performance", schoolId)
    ),

  books: (params?: {
    class_grade?: number;
    subject?: string;
    program?: string;
    exam_track?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.class_grade) q.set("class_grade", String(params.class_grade));
    if (params?.subject) q.set("subject", params.subject);
    if (params?.program) q.set("program", params.program);
    if (params?.exam_track) q.set("exam_track", params.exam_track);
    const qs = q.toString();
    return request<Book[]>(`/api/books${qs ? `?${qs}` : ""}`);
  },

  book: (id: number) => request<Book>(`/api/books/${id}`),

  uploadBook: (form: FormData) => {
    const ctx = getSchoolContextId();
    if (ctx && !form.has("school_id")) form.append("school_id", String(ctx));
    return request<Book>("/api/books/upload", { method: "POST", body: form });
  },

  createManualBook: (data: {
    program: string;
    exam_track?: string;
    class_grade: number;
    subject: string;
    title: string;
    chapters: Array<{
      chapter_number: number;
      title: string;
      content: string;
      source_file_path?: string;
      source_file_type?: string;
      pdf_page_count?: number;
    }>;
  }) => {
    const ctx = getSchoolContextId();
    return request<Book>("/api/books/manual", {
      method: "POST",
      body: jsonBody({
        ...data,
        exam_track: data.exam_track ?? "",
        ...(ctx ? { school_id: ctx } : {}),
      }),
    });
  },

  extractChapterText: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{
      text: string;
      char_count: number;
      file_name: string;
      source_file_path?: string;
      source_file_type?: string;
      pdf_page_count?: number | null;
    }>("/api/books/extract-text", { method: "POST", body: form });
  },

  waitForBookReady: async (
    bookId: number,
    onProgress?: (book: Book) => void,
    intervalMs = 1000,
    maxAttempts = 120
  ): Promise<Book> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const book = await request<Book>(`/api/books/${bookId}`);
      onProgress?.(book);
      if (book.status === "ready") return book;
      if (book.status !== "processing") {
        throw new Error(book.processing_message || "Book processing failed");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error("Book processing is taking longer than expected. Refresh the page shortly.");
  },

  deleteBook: (id: number) =>
    request<{ message: string; book_id: number }>(`/api/books/${id}`, {
      method: "DELETE",
    }),

  refreshBookContent: (id: number) =>
    request<{ book: Book; chapters_filled: number; message: string }>(
      `/api/books/${id}/refresh-content`,
      { method: "POST" }
    ),

  updateChapter: (
    chapterId: number,
    data: { title?: string; content?: string; chapter_number?: number }
  ) =>
    request(`/api/books/chapters/${chapterId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generateLectures: (
    chapterIds: number[],
    options?: { lecture_language?: string; lecture_persona?: string }
  ) =>
    request<{
      message: string;
      started_chapter_ids: number[];
      results: Array<{ chapter_id: number; status: string; reason?: string }>;
    }>("/api/books/chapters/generate-lectures", {
      method: "POST",
      body: jsonBody({
        chapter_ids: chapterIds,
        lecture_language: options?.lecture_language ?? "english",
        lecture_persona: options?.lecture_persona ?? "warm",
      }),
    }),

  generateLecture: (chapterId: number) =>
    request<{ message: string; chapter_id: number; status: string }>(
      `/api/books/chapters/${chapterId}/generate-lecture`,
      {
        method: "POST",
        body: JSON.stringify({}),
      }
    ),

  chapterStatus: (chapterId: number) =>
    request<{
      chapter_id: number;
      status: string;
      lecture_parts: Array<{
        id: number;
        part_number: number;
        title: string;
        status: string;
        duration_minutes: number;
        audio_url: string | null;
      }>;
    }>(`/api/books/chapters/${chapterId}/status`),

  lectureSession: (lectureId: number) =>
    request<import("@/types").LectureSession>(`/api/books/lectures/${lectureId}/session`),

  students: () => request<User[]>(appendSchoolId("/api/students")),

  createStudent: (data: {
    email: string;
    password: string;
    full_name: string;
    role: "student";
    class_grade?: number;
    program?: string;
    exam_track?: string;
    access_role_id?: number | null;
    phone?: string;
    parent_name?: string;
    parent_phone?: string;
    parent_password?: string;
  }) =>
    request<User>(appendSchoolId("/api/students"), {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStudentAccessRole: (studentId: number, access_role_id: number | null) =>
    request<User>(appendSchoolId(`/api/students/${studentId}/access-role`), {
      method: "PATCH",
      body: JSON.stringify({ access_role_id }),
    }),

  downloadStudentImportTemplate: () =>
    downloadFileResponse(
      appendSchoolId("/api/students/import/template"),
      {},
      "vidyaai-student-import-template.xlsx"
    ),

  bulkImportStudents: (form: FormData) =>
    downloadFileResponse(
      appendSchoolId("/api/students/bulk-import"),
      { method: "POST", body: form },
      "vidyaai-credentials.xlsx"
    ),

  updateStudentStatus: (
    studentId: number,
    data: {
      account_status: "active" | "suspended" | "service_stopped";
      status_note?: string;
    }
  ) =>
    request<User>(appendSchoolId(`/api/students/${studentId}/status`), {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  tutorChat: (data: {
    message: string;
    class_grade?: number;
    subject?: string;
    chapter_id?: number;
    book_page_number?: number;
  }) => request<{ reply: string }>("/api/tutor/chat", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  schedules: () => request<import("@/types").LectureSchedule[]>("/api/schedules"),

  createSchedules: (data: {
    class_grade: number;
    subject: string;
    start_date: string;
    weeks?: number;
    days_of_week: number[];
    start_time: string;
    duration_minutes?: number;
  }) =>
    request<{ message: string; created: number; schedules: import("@/types").LectureSchedule[] }>(
      appendSchoolId("/api/schedules"),
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  createSchedule: (data: { chapter_id: number; scheduled_at: string; duration_minutes?: number }) =>
    request<import("@/types").LectureSchedule>("/api/schedules/single", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteSchedule: (id: number) =>
    request<{ message: string; schedule_id: number }>(`/api/schedules/${id}`, { method: "DELETE" }),

  recordings: () => request<import("@/types").Recording[]>("/api/schedules/recordings"),

  practiceTemplates: (params?: { program?: string; school_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.program) q.set("program", params.program);
    const user = getStoredUser();
    const schoolId =
      params?.school_id ??
      (user?.role === "super_admin" ? getSchoolContextId() ?? undefined : undefined);
    if (schoolId) q.set("school_id", String(schoolId));
    const qs = q.toString();
    return request<import("@/types").PracticeTemplate[]>(
      `/api/practice/templates${qs ? `?${qs}` : ""}`
    );
  },

  createPracticeTemplate: (data: {
    title: string;
    plan_type: string;
    class_grade: number;
    subject: string;
    chapter_ids: number[];
    question_count: number;
    program?: string;
  }) =>
    request<import("@/types").PracticeTemplate>(appendSchoolId("/api/practice/templates"), {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deletePracticeTemplate: (id: number) =>
    request<{ message: string }>(`/api/practice/templates/${id}`, { method: "DELETE" }),

  generatePractice: (data: {
    template_id?: number;
    subject?: string;
    plan_type?: string;
    chapter_ids?: number[];
    question_count?: number;
  }) =>
    request<import("@/types").PracticePaper>("/api/practice/generate", {
      method: "POST",
      body: jsonBody(data),
    }),

  practicePapers: () => request<import("@/types").PracticePaper[]>("/api/practice/papers"),

  practicePaper: (paperId: number) =>
    request<import("@/types").PracticePaper>(`/api/practice/papers/${paperId}`),

  finishPractice: (paperId: number) =>
    request<{
      paper_id: number;
      upload_token: string;
      upload_url: string;
      expires_at: string;
    }>(`/api/practice/papers/${paperId}/finish`, { method: "POST" }),

  practiceUploadSession: (token: string) =>
    publicRequest<{
      paper_id: number;
      title: string;
      subject: string;
      status: string;
      exam_meta: Record<string, unknown>;
      questions: Array<{
        number: number;
        question: string;
        marks: number;
        type?: string | null;
      }>;
      ends_at?: string | null;
      upload_grace_ends_at?: string | null;
    }>(`/api/practice/upload/${token}`),

  uploadPracticeSheets: (token: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return publicRequest<{
      message: string;
      paper_id: number;
      page_count: number;
      status: string;
    }>(`/api/practice/upload/${token}`, { method: "POST", body: form });
  },

  uploadPracticeQuestionImages: (
    token: string,
    byQuestion: Record<number, File[]>
  ) => {
    const form = new FormData();
    Object.entries(byQuestion).forEach(([qNum, files]) => {
      files.forEach((file) => form.append(`q_${qNum}`, file));
    });
    return publicRequest<{
      message: string;
      paper_id: number;
      page_count: number;
      questions_with_images?: string[];
      status: string;
    }>(`/api/practice/upload/${token}`, { method: "POST", body: form });
  },

  practiceUploadResult: (token: string) =>
    publicRequest<{
      paper_id: number;
      status: string;
      score: number | null;
      total: number;
      percent: number;
      evaluation: import("@/types").PracticePaper["evaluation"];
    }>(`/api/practice/upload/${token}/result`),

  submitPractice: (paperId: number, answers: Record<number, string>) =>
    request<{
      paper_id: number;
      score: number;
      total: number;
      percent: number;
      plan_type: string;
      parent_notify?: {
        sent: number;
        phones: string[];
        suggestions: string[];
        error?: string | null;
      } | null;
    }>(
      `/api/practice/papers/${paperId}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [String(k), v])),
        }),
      }
    ),

  supportChat: (data: {
    message: string;
    subject: string;
    chapter_id: number;
    book_page_number?: number;
  }) =>
    request<{ reply: string; transcript?: string; audio_url?: string }>("/api/support/chat", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  supportVoice: (form: FormData) =>
    request<{ reply: string; transcript?: string; audio_url?: string }>("/api/support/voice", {
      method: "POST",
      body: form,
    }),

  supportHistory: (params: { subject: string; chapter_id: number }) => {
    const qs = new URLSearchParams({
      subject: params.subject,
      chapter_id: String(params.chapter_id),
    });
    return request<{
      messages: Array<{
        id: number;
        role: string;
        content: string;
        audio_url?: string | null;
        created_at?: string | null;
      }>;
    }>(`/api/support/history?${qs.toString()}`);
  },

  supportSessions: () =>
    request<{
      sessions: Array<{
        chapter_id: number;
        subject: string;
        chapter_title: string;
        chapter_number?: number | null;
        last_message: string;
        last_role: string;
        updated_at?: string | null;
      }>;
    }>("/api/support/sessions"),

  notesSubjects: () =>
    request<
      Array<{
        subject: string;
        class_grade: number;
        board: string;
        chapter_count: number;
        ready_count: number;
        generating_count: number;
        topic_count: number;
      }>
    >("/api/notes/subjects"),

  notesBySubject: (subject: string) =>
    request<
      Array<{
        chapter_id: number;
        title: string;
        chapter_title: string;
        subject: string;
        class_grade: number;
        board: string;
        topic_count: number;
        status: string;
        lecture_id?: number | null;
        topics?: Array<{
          topic_index: number;
          title: string;
          preview?: string;
          has_examples?: boolean;
          has_questions?: boolean;
          key_point_count?: number;
        }>;
      }>
    >(`/api/notes/by-subject?subject=${encodeURIComponent(subject)}`),

  notesChapterTopics: (chapterId: number) =>
    request<{
      chapter_id: number;
      chapter_title: string;
      subject: string;
      class_grade: number;
      board: string;
      status: string;
      overview?: string;
      topics: Array<{
        topic_index: number;
        title: string;
        preview?: string;
        has_examples?: boolean;
        has_questions?: boolean;
        key_point_count?: number;
      }>;
      lecture_id?: number | null;
    }>(`/api/notes/chapters/${chapterId}/topics`),

  notesTopicDetail: (chapterId: number, topicIndex: number) =>
    request<{
      chapter_id: number;
      chapter_title: string;
      subject: string;
      class_grade: number;
      board: string;
      topic_index: number;
      topic_count: number;
      prev_index?: number | null;
      next_index?: number | null;
      topic: {
        title: string;
        theory: string;
        formulas?: string[];
        examples?: string[];
        worked_examples?: Array<{ title?: string; problem?: string; steps?: string; solution?: string }>;
        key_points?: string[];
        questions_with_answers?: Array<{ question: string; answer?: string; steps?: string; source?: string }>;
        practice?: Array<{ question: string; hint?: string; answer?: string; answer_outline?: string }>;
        exam_tips?: string[];
      };
    }>(`/api/notes/chapters/${chapterId}/topics/${topicIndex}`),

  notesList: () =>
    request<
      Array<{
        chapter_id: number;
        title: string;
        chapter_title: string;
        subject: string;
        class_grade: number;
        board: string;
        topic_count: number;
        status: string;
        lecture_id?: number | null;
      }>
    >("/api/notes"),

  notesChapterDetail: (chapterId: number) =>
    request<{
      chapter_id: number;
      title: string;
      chapter_title: string;
      subject: string;
      class_grade: number;
      board: string;
      status: string;
      overview: string;
      topics: Array<{
        title: string;
        theory: string;
        formulas?: string[];
        examples?: string[];
        worked_examples?: Array<{ title?: string; problem?: string; steps?: string; solution?: string }>;
        key_points?: string[];
        questions_with_answers?: Array<{ question: string; answer?: string; steps?: string; source?: string }>;
        practice?: Array<{ question: string; hint?: string; answer?: string; answer_outline?: string }>;
        exam_tips?: string[];
      }>;
      questions_with_answers?: Array<{ question: string; answer?: string; steps?: string; source?: string }>;
      revision_sheet?: string[];
      important_questions?: string[];
      exam_tips?: string[];
      lecture_id?: number | null;
    }>(`/api/notes/chapters/${chapterId}`),

  notesDetail: (lectureId: number) =>
    request<{
      lecture_id: number;
      chapter_id: number;
      title: string;
      chapter_title: string;
      subject: string;
      class_grade: number;
      board?: string;
      pages: Array<{
        page_number: number;
        title: string;
        summary: string;
        transcript?: string;
        lines?: Array<{ text: string; start_seconds: number; end_seconds: number; duration_seconds: number }>;
        sections: Array<{ heading: string; body: string; bullets?: string[] }>;
        key_points: string[];
        practice?: Array<{ question: string; hint?: string; answer_outline?: string }>;
        start_seconds: number;
        duration_seconds: number;
      }>;
    }>(`/api/notes/lectures/${lectureId}`),

  supportDeleteHistory: (params: { subject: string; chapter_id: number }) => {
    const qs = new URLSearchParams({
      subject: params.subject,
      chapter_id: String(params.chapter_id),
    });
    return request<{ ok: boolean; deleted: number }>(`/api/support/history?${qs.toString()}`, {
      method: "DELETE",
    });
  },

  supportAudioUrl: (path: string) => {
    const token = getToken();
    const url = path.startsWith(API_ROOT) ? `${getApiBaseUrl()}${path}` : apiUrl(path);
    if (!token) return url;
    return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  },

  saveProgress: (data: {
    lecture_part_id: number;
    completed?: boolean;
    last_position_seconds?: number;
  }) =>
    request<{ ok: boolean }>("/api/students/progress", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  audioUrl: (path: string) => {
    const token = getToken();
    const url = path.startsWith(API_ROOT) ? `${getApiBaseUrl()}${path}` : apiUrl(path);
    if (!token) return url;
    return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  },

  imageUrl: (path: string) => {
    const token = getToken();
    const url = path.startsWith(API_ROOT) ? `${getApiBaseUrl()}${path}` : apiUrl(path);
    if (!token) return url;
    return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  },
};

export function saveSession(token: string, user: User, refreshToken?: string | null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw =
    localStorage.getItem(USER_KEY) ?? localStorage.getItem(LEGACY_USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function dashboardPath(role: UserRole): string {
  if (role === "super_admin") return "/dashboard/super-admin";
  if (role === "admin") return "/dashboard/admin";
  if (role === "parent") return "/dashboard/parent";
  return "/dashboard/student";
}
