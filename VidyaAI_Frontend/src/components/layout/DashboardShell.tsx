"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Crown,
  Headphones,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Mic,
  PenLine,
  Shield,
  Users,
  X,
  HeartHandshake,
  FileBarChart2,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  clearSession,
  getSidebarOpenPreference,
  getStoredUser,
  getToken,
  saveSession,
  setSidebarOpenPreference,
  api,
} from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import {
  adminDomainLabel,
  canAccessDashboardPath,
  defaultDashboardPath,
  filterAdminNav,
  filterStudentNav,
} from "@/lib/servicePermissions";
import { hasSchedule, isSchoolProgram, normalizeProgram, PROGRAM_SHORT } from "@/lib/programs";
import type { Program, ServicePermission, User } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: ServicePermission | "students" | "full";
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const parentSections: NavSection[] = [
  {
    title: "Family",
    items: [{ href: "/dashboard/parent", label: "Parental Control", icon: HeartHandshake }],
  },
];

const superAdminSections: NavSection[] = [
  {
    title: "Platform",
    items: [
      { href: "/dashboard/super-admin", label: "Command Center", icon: Crown },
      { href: "/dashboard/super-admin/schools", label: "Schools", icon: Building2 },
      { href: "/dashboard/super-admin/users", label: "Admins", icon: Users },
      { href: "/dashboard/super-admin/roles", label: "Access Roles", icon: KeyRound },
      { href: "/dashboard/super-admin/leads", label: "Leads", icon: Mail },
    ],
  },
];

function adminSectionsForProgram(program: Program): NavSection[] {
  const manage: NavItem[] = [
    { href: "/dashboard/admin/books", label: "Books & Lectures", icon: BookOpen, permission: "lectures" },
  ];
  if (hasSchedule(program)) {
    manage.push({ href: "/dashboard/admin/schedule", label: "Schedule", icon: Calendar, permission: "schedule" });
  }
  manage.push(
    { href: "/dashboard/admin/practice", label: "Practice Plans", icon: PenLine, permission: "practice" },
    { href: "/dashboard/admin/students", label: "Students", icon: Users },
    { href: "/dashboard/admin/records", label: "Student Records", icon: FileBarChart2 },
    { href: "/dashboard/admin/access", label: "Student Access", icon: Shield, permission: "full" }
  );

  return [
    {
      title: "Overview",
      items: [{ href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard }],
    },
    { title: "Manage", items: manage },
  ];
}

function userInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard/super-admin" || href === "/dashboard/admin" || href === "/dashboard/student") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function roleLabel(user: User, program: string) {
  if (user.role === "student") {
    const p = normalizeProgram(program);
    return isSchoolProgram(p) && user.class_grade
      ? `Class ${user.class_grade}`
      : PROGRAM_SHORT[p];
  }
  if (user.role === "super_admin") return "Super Admin";
  if (user.role === "parent") return "Parent";
  return adminDomainLabel(user.program, user.exam_track);
}

function NavItemLink({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`dashboard-nav-item ${active ? "dashboard-nav-item-active" : ""} ${collapsed ? "dashboard-nav-item-collapsed" : ""}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

function SidebarNav({
  sections,
  flatNav,
  pathname,
  collapsed,
  onNavigate,
}: {
  sections?: NavSection[];
  flatNav?: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (sections) {
    return (
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            {!collapsed && <p className="dashboard-nav-section">{section.title}</p>}
            <div className={`space-y-1 ${collapsed ? "" : "mt-2"}`}>
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {flatNav?.map((item) => (
        <NavItemLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function SidebarContent({
  user,
  program,
  pathname,
  sections,
  flatNav,
  collapsed,
  onNavigate,
}: {
  user: User;
  program: string;
  pathname: string;
  sections?: NavSection[];
  flatNav?: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <>
      <div className={`dashboard-sidebar-header ${collapsed ? "dashboard-sidebar-header-collapsed" : ""}`}>
        <BrandLogo
          href="/"
          height={collapsed ? 34 : 48}
          imagePosition={collapsed ? "center" : "left"}
          className={collapsed ? "dashboard-sidebar-logo-compact" : ""}
        />
        {!collapsed && <p className="dashboard-sidebar-tagline">{PRODUCT_NAME} Console</p>}
      </div>

      <div className="dashboard-sidebar-nav scroll-area">
        <SidebarNav
          sections={sections}
          flatNav={flatNav}
          pathname={pathname}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>

      <div className={`dashboard-sidebar-footer ${collapsed ? "dashboard-sidebar-footer-collapsed" : ""}`}>
        <div className={`dashboard-user-card ${collapsed ? "dashboard-user-card-collapsed" : ""}`}>
          <div className="dashboard-user-avatar" aria-hidden title={user.full_name}>
            {userInitials(user.full_name)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
              <p className="truncate text-xs text-slate-400">{roleLabel(user, program)}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
          title={collapsed ? "Sign out" : undefined}
          className={`dashboard-nav-item mt-2 text-red-300/90 hover:bg-red-500/10 hover:text-red-200 ${collapsed ? "dashboard-nav-item-collapsed" : "w-full"}`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

const STUDENT_NAV_SHORT: Record<string, string> = {
  Dashboard: "Home",
  "My Schedule": "Schedule",
  "Live Class": "Live",
  Recordings: "Past",
  Notes: "Notes",
  Practice: "Practice",
  Support: "Help",
};

const STUDENT_NAV_ICONS = {
  Dashboard: LayoutDashboard,
  "My Schedule": Calendar,
  "Live Class": Mic,
  Recordings: History,
  Notes: BookOpen,
  Practice: PenLine,
  Support: Headphones,
} as const;

function buildStudentNav(user: User): NavItem[] {
  return filterStudentNav(user).map((item) => ({
    href: item.href,
    label: item.label,
    icon: STUDENT_NAV_ICONS[item.label as keyof typeof STUDENT_NAV_ICONS] ?? LayoutDashboard,
  }));
}

function DashboardShellLoading() {
  return (
    <div className="mesh-bg flex min-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  title: string;
  /** Optional header eyebrow (defaults by role). */
  eyebrow?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setSidebarOpen(getSidebarOpenPreference(true));
  }, []);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace("/login");
      return;
    }

    setUser(stored);

    const token = getToken();
    if (token) {
      api
        .me()
        .then((fresh) => {
          saveSession(token, fresh);
          setUser(fresh);
          routeByRole(fresh);
        })
        .catch(() => routeByRole(stored));
    } else {
      routeByRole(stored);
    }

    function routeByRole(u: User) {
      if (u.role === "super_admin" && pathname.startsWith("/dashboard/admin")) {
        router.replace("/dashboard/super-admin");
      } else if (u.role === "super_admin" && pathname.startsWith("/dashboard/student")) {
        router.replace("/dashboard/super-admin");
      } else if (u.role === "admin" && pathname.startsWith("/dashboard/super-admin")) {
        router.replace("/dashboard/admin");
      } else if (u.role === "admin" && pathname.startsWith("/dashboard/parent")) {
        router.replace("/dashboard/admin");
      } else if (u.role === "parent" && (pathname.startsWith("/dashboard/super-admin") || pathname.startsWith("/dashboard/admin") || pathname.startsWith("/dashboard/student"))) {
        router.replace("/dashboard/parent");
      } else if (
        u.role === "student" &&
        (pathname.startsWith("/dashboard/super-admin") || pathname.startsWith("/dashboard/admin") || pathname.startsWith("/dashboard/parent"))
      ) {
        router.replace("/dashboard/student");
      } else if (
        (u.role === "admin" || u.role === "student") &&
        pathname.startsWith("/dashboard/") &&
        !canAccessDashboardPath(u, pathname)
      ) {
        router.replace(defaultDashboardPath(u));
      }
    }
  }, [router, pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    setSidebarOpen((prev) => {
      const next = !prev;
      setSidebarOpenPreference(next);
      return next;
    });
  }

  if (!user) {
    return <DashboardShellLoading />;
  }

  const program = normalizeProgram(
    user.role === "student" || user.role === "admin"
      ? user.program ?? (user as { track?: string }).track
      : undefined
  );

  const flatNav = user.role === "student" ? buildStudentNav(user) : undefined;
  const sections =
    user.role === "super_admin"
      ? superAdminSections
      : user.role === "admin"
        ? filterAdminNav(user, adminSectionsForProgram(program))
        : user.role === "parent"
          ? parentSections
          : undefined;

  const sidebarProps = {
    user,
    program,
    pathname,
    sections,
    flatNav,
  };

  return (
    <div className="mesh-bg flex min-h-[100dvh] w-full max-w-[100vw] flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden lg:flex-row">
        <div
          className={`dashboard-sidebar-shell hidden shrink-0 lg:block ${
            sidebarOpen ? "dashboard-sidebar-shell-open" : ""
          }`}
        >
          <aside
            className={`dashboard-sidebar flex h-full ${sidebarOpen ? "dashboard-sidebar-open" : "dashboard-sidebar-collapsed"}`}
          >
            <SidebarContent {...sidebarProps} collapsed={!sidebarOpen} />
            <button
              type="button"
              onClick={toggleSidebar}
              className="dashboard-sidebar-toggle"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </aside>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="dashboard-sidebar dashboard-sidebar-open absolute left-0 top-0 flex h-full shadow-2xl">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent {...sidebarProps} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-6">
          <header className="glass mb-4 flex flex-col gap-3 rounded-2xl px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 lg:mb-6 lg:px-6 lg:py-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="hidden shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] p-2 text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-white lg:inline-flex"
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:text-xs">
                  {eyebrow ??
                    (user.role === "super_admin"
                      ? "Platform"
                      : user.role === "admin"
                        ? "School"
                        : user.role === "parent"
                          ? "Parent"
                          : "Student")}
                </p>
                <h1 className="truncate text-base font-bold sm:text-lg md:text-2xl">{title}</h1>
              </div>
            </div>
            <span
              className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium sm:px-3 sm:text-xs ${
                user.role === "super_admin"
                  ? "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/25"
                  : "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/25"
              }`}
            >
              {roleLabel(user, program)}
            </span>
          </header>
          <div className="dashboard-content w-full min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
        </main>
      </div>

      <nav className="glass fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around border-t border-white/10 px-0.5 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden">
        {(flatNav ?? sections?.flatMap((s) => s.items) ?? []).slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const short =
            STUDENT_NAV_SHORT[item.label] ??
            (item.label.length > 10 ? item.label.split(" ")[0] : item.label);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[9px] leading-tight sm:text-[10px] ${
                active ? "text-indigo-300" : "text-slate-500"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="max-w-full truncate px-0.5">{short}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
