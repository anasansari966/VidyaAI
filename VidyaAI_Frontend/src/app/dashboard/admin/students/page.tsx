"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StudentBulkImport } from "@/components/admin/StudentBulkImport";
import { api, getStoredUser } from "@/lib/api";
import { ProgramPathPicker } from "@/components/programs/ProgramPathPicker";
import {
  defaultExamTrack,
  formatPathLabel,
  listStudentDomainGroups,
  PROGRAM_CATALOG,
  SCHOOL_SUBJECTS,
  studentDomainUsesGroups,
  studentsInDomainGroup,
  summarizeStudentDomains,
  type ProgramPathValue,
} from "@/lib/programCatalog";
import { isSchoolProgram, normalizeProgram, PROGRAM_SHORT, type Program } from "@/lib/programs";
import type { User } from "@/types";
import { Button } from "@/components/ui/Button";
import {
  Atom,
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  RefreshCw,
  Stethoscope,
} from "lucide-react";

const DOMAIN_ICONS: Record<Program, typeof GraduationCap> = {
  school: GraduationCap,
  jee: Atom,
  neet: Stethoscope,
  govt: Building2,
};

type BrowseView =
  | { step: "domains" }
  | { step: "groups"; program: Program }
  | { step: "students"; program: Program; groupKey: string };

function studentStatusBadge(user: User) {
  const status = user.account_status ?? (user.is_active ? "active" : "suspended");
  if (status === "service_stopped") return { label: "Service stopped", className: "bg-red-500/10 text-red-400" };
  if (status === "suspended") return { label: "Suspended", className: "bg-amber-500/10 text-amber-400" };
  return { label: "Active", className: "bg-emerald-500/10 text-emerald-400" };
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<User[]>([]);
  const [browseView, setBrowseView] = useState<BrowseView>({ step: "domains" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [path, setPath] = useState<ProgramPathValue>({
    program: "school",
    examTrack: "",
    classGrade: 9,
    subject: SCHOOL_SUBJECTS[0],
  });
  const [message, setMessage] = useState("");

  const adminUser = getStoredUser();
  const adminProgram = normalizeProgram(adminUser?.program);
  const adminExamTrack = adminUser?.exam_track || defaultExamTrack(adminProgram);

  async function load() {
    const studentList = await api.students();
    setStudents(studentList);
  }

  useEffect(() => {
    load().catch(console.error);
    if (adminUser?.program) {
      const program = normalizeProgram(adminUser.program);
      setPath((prev) => ({
        ...prev,
        program,
        examTrack: adminUser.exam_track ?? prev.examTrack,
      }));
      if (!isSchoolProgram(program)) {
        setBrowseView({ step: "students", program, groupKey: "*" });
      } else {
        setBrowseView({ step: "domains" });
      }
    }
  }, []);

  const domainSummaries = summarizeStudentDomains(students).filter(
    (domain) => domain.program === adminProgram
  );
  const browseGroups =
    browseView.step !== "domains" ? listStudentDomainGroups(browseView.program, students) : [];
  const browseStudents =
    browseView.step === "students"
      ? studentsInDomainGroup(students, browseView.program, browseView.groupKey)
      : [];

  function browseTitle(): string {
    if (browseView.step === "domains") return "Students by domain";
    if (browseView.step === "groups") return PROGRAM_CATALOG[browseView.program].label;
    if (browseView.program === "school") return `Class ${browseView.groupKey}`;
    return `${PROGRAM_SHORT[browseView.program]} — Students`;
  }

  function openDomain(program: Program) {
    if (studentDomainUsesGroups(program)) {
      setBrowseView({ step: "groups", program });
    } else {
      setBrowseView({ step: "students", program, groupKey: "*" });
    }
  }

  function openGroup(program: Program, groupKey: string) {
    setBrowseView({ step: "students", program, groupKey });
  }

  function browseBack() {
    if (browseView.step === "students") {
      if (studentDomainUsesGroups(browseView.program)) {
        setBrowseView({ step: "groups", program: browseView.program });
      } else {
        setBrowseView({ step: "domains" });
      }
    } else if (browseView.step === "groups") {
      setBrowseView({ step: "domains" });
    }
  }

  return (
    <DashboardShell title="Students">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-xl p-6">
          <div className="mb-5 border-b border-white/[0.06] pb-4">
            <h2 className="text-base font-semibold text-slate-100">Add student</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isSchoolProgram(adminProgram)
                ? "Enroll a learner for a complete class — all subjects in that class are included."
                : "Enroll a learner under your learning path."}
            </p>
          </div>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const created = await api.createStudent({
                  email,
                  password,
                  full_name: fullName,
                  role: "student",
                  class_grade: isSchoolProgram(path.program) ? path.classGrade : undefined,
                  program: path.program,
                  exam_track: !isSchoolProgram(path.program) ? path.examTrack || undefined : undefined,
                  parent_name: parentName.trim() || undefined,
                  parent_phone: parentPhone.trim() || undefined,
                  parent_password: parentPassword.trim() || undefined,
                });
                setEmail("");
                setPassword("");
                setFullName("");
                setParentName("");
                setParentPhone("");
                setParentPassword("");
                setMessage(
                  parentPhone.trim()
                    ? "Student and parent account created. Parent can log in with their mobile number."
                    : "Student created."
                );
                await load();
                const groupKey =
                  path.program === "school"
                    ? String(created.class_grade ?? path.classGrade)
                    : studentDomainUsesGroups(path.program)
                      ? created.exam_track || path.examTrack || ""
                      : "*";
                setBrowseView({ step: "students", program: path.program, groupKey });
              } catch (err) {
                setMessage(err instanceof Error ? err.message : "Failed");
              }
            }}
          >
            <input
              className="input-field"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              className="input-field"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ProgramPathPicker
              compact
              hideSubject
              value={path}
              onChange={setPath}
              lockedProgram={adminProgram}
              lockedExamTrack={!isSchoolProgram(adminProgram) ? adminExamTrack : undefined}
            />

            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
              <h3 className="text-sm font-semibold text-emerald-100">Parent account (optional)</h3>
              <p className="mt-1 text-xs text-slate-400">
                Add parent phone and password so they can log in and track this student&apos;s performance.
              </p>
              <div className="mt-3 space-y-3">
                <input
                  className="input-field"
                  placeholder="Parent name (optional)"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                />
                <input
                  className="input-field"
                  type="tel"
                  placeholder="Parent mobile number"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                />
                <input
                  className="input-field"
                  type="password"
                  placeholder="Parent password"
                  value={parentPassword}
                  onChange={(e) => setParentPassword(e.target.value)}
                  required={Boolean(parentPhone.trim())}
                />
              </div>
            </div>

            <Button type="submit" className="w-full rounded-lg">
              Create student
            </Button>
          </form>

          <StudentBulkImport adminProgram={adminProgram} onComplete={load} />
          {message && (
            <p className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-300">
              {message}
            </p>
          )}
        </div>

        <div className="glass rounded-xl p-6">
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {browseView.step !== "domains" && (
                  <button
                    type="button"
                    onClick={browseBack}
                    className="rounded-md border border-white/10 p-1.5 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                    title="Back"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <h2 className="truncate text-base font-semibold text-slate-100">{browseTitle()}</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {browseView.step === "domains"
                  ? "Browse enrolled students by learning path."
                  : browseView.step === "groups"
                    ? "Select an exam track."
                    : browseView.program === "jee" || browseView.program === "neet"
                      ? "All students in this program. Main/Advanced or track shown on each card."
                      : "Students in this section only."}
              </p>
            </div>
            <button
              onClick={() => load()}
              className="rounded-md border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="scroll-area max-h-[420px] space-y-1.5">
            {browseView.step === "domains" && (
              <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
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
                            {domain.studentCount} student{domain.studentCount === 1 ? "" : "s"}
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
              <>
                {browseGroups.filter((g) => (g.studentCount ?? 0) > 0).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                    No students in this domain yet.
                  </p>
                ) : (
                  <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
                    {browseGroups
                      .filter((g) => (g.studentCount ?? 0) > 0)
                      .map((group) => (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => openGroup(browseView.program, group.key)}
                          className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-100">{group.label}</p>
                              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                                {group.studentCount}
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
              </>
            )}

            {browseView.step === "students" && (
              <>
                {browseStudents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
                    No students in this section.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {browseStudents.map((s) => {
                      const badge = studentStatusBadge(s);
                      return (
                        <div
                          key={s.id}
                          className="rounded-lg border border-white/[0.08] px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-100">{s.full_name}</p>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{s.email}</p>
                          <p className="text-xs text-slate-600">
                            {s.program && s.program !== "school"
                              ? formatPathLabel(s.program as Program, s.exam_track ?? "")
                              : s.class_grade
                                ? `Class ${s.class_grade}`
                                : "School"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
