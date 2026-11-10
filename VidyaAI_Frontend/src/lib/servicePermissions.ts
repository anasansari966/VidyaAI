import type { ServicePermission, User } from "@/types";
import { hasSchedule, isSchoolProgram, normalizeProgram, programNav } from "@/lib/programs";

export const SERVICE_PERMISSION_LABELS: Record<ServicePermission, string> = {
  schedule: "My Schedule",
  lectures: "Live Class",
  recordings: "Recordings",
  practice: "Practice",
  support: "Support",
};

const ALL_PERMISSIONS: ServicePermission[] = [
  "schedule",
  "lectures",
  "recordings",
  "practice",
  "support",
];

const STUDENT_NAV_PERMISSION_MAP: Record<string, ServicePermission | "dashboard"> = {
  "/dashboard/student": "dashboard",
  "/dashboard/student/schedule": "schedule",
  "/dashboard/student/lectures": "lectures",
  "/dashboard/student/recordings": "recordings",
  "/dashboard/student/notes": "lectures",
  "/dashboard/student/practice": "practice",
  "/dashboard/student/support": "support",
};

const ADMIN_NAV_PERMISSION_MAP: Record<string, ServicePermission | "dashboard" | "students" | "full"> = {
  "/dashboard/admin": "dashboard",
  "/dashboard/admin/books": "lectures",
  "/dashboard/admin/schedule": "schedule",
  "/dashboard/admin/practice": "practice",
  "/dashboard/admin/students": "students",
  "/dashboard/admin/records": "students",
  "/dashboard/admin/access": "full",
};

export function resolvedPermissions(user: User | null | undefined): ServicePermission[] {
  if (!user?.service_permissions?.length) {
    return ALL_PERMISSIONS;
  }
  return user.service_permissions.filter((p): p is ServicePermission =>
    ALL_PERMISSIONS.includes(p as ServicePermission)
  );
}

export function hasFullServiceAccess(user: User | null | undefined): boolean {
  const perms = resolvedPermissions(user);
  return ALL_PERMISSIONS.every((p) => perms.includes(p));
}

export function userHasPermission(user: User, permission: ServicePermission): boolean {
  return resolvedPermissions(user).includes(permission);
}

export function filterStudentNav(user: User) {
  const program = normalizeProgram(user.program);
  const baseNav = programNav(program);
  return baseNav.filter((item) => {
    const perm = STUDENT_NAV_PERMISSION_MAP[item.href];
    if (perm === "dashboard") return true;
    if (!perm) return true;
    if (perm === "schedule" && !hasSchedule(program)) return false;
    return userHasPermission(user, perm);
  });
}

type AdminNavItem = {
  href: string;
  label: string;
  icon: typeof import("lucide-react").LayoutDashboard;
  permission?: ServicePermission | "students" | "full";
};

type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export function filterAdminNav(user: User, sections: AdminNavSection[]): AdminNavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const perm = item.permission ?? ADMIN_NAV_PERMISSION_MAP[item.href];
        if (perm === "dashboard" || perm === "students") return true;
        if (perm === "full") return hasFullServiceAccess(user);
        if (!perm) return true;
        if (perm === "schedule" && !hasSchedule(user.program)) return false;
        return userHasPermission(user, perm);
      }),
    }))
    .filter((section) => section.items.length > 0);
}

export function canAccessDashboardPath(user: User, pathname: string): boolean {
  if (user.role === "super_admin") return true;

  const map =
    user.role === "admin" ? ADMIN_NAV_PERMISSION_MAP : STUDENT_NAV_PERMISSION_MAP;

  const matched = Object.entries(map)
    .filter(([href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b[0].length - a[0].length)[0];

  if (!matched) return true;

  const perm = matched[1];
  if (perm === "dashboard" || perm === "students") return true;
  if (perm === "full") return hasFullServiceAccess(user);
  if (perm === "schedule" && !hasSchedule(user.program)) return false;
  return userHasPermission(user, perm as ServicePermission);
}

export function defaultDashboardPath(user: User): string {
  if (user.role === "super_admin") return "/dashboard/super-admin";
  if (user.role === "admin") return "/dashboard/admin";
  if (user.role === "parent") return "/dashboard/parent";
  return "/dashboard/student";
}

export function adminDomainLabel(program: string | undefined | null, examTrack?: string | null) {
  const p = normalizeProgram(program);
  if (isSchoolProgram(p)) return "School Admin";
  if (p === "jee") return "JEE Admin";
  if (p === "neet") return "NEET Admin";
  if (p === "govt") return `Govt Admin${examTrack ? ` (${examTrack.toUpperCase()})` : ""}`;
  return "Admin";
}
