"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api, getStoredUser } from "@/lib/api";
import {
  formatPathLabel,
  listStudentDomainGroups,
  studentsInDomainGroup,
  studentDomainUsesGroups,
} from "@/lib/programCatalog";
import { isSchoolProgram, normalizeProgram, type Program } from "@/lib/programs";
import type { User } from "@/types";
import { ChevronLeft, ChevronRight, GraduationCap, Loader2, RefreshCw } from "lucide-react";

type StatusFilter = "all" | "active" | "suspended" | "service_stopped";
type AccountStatus = "active" | "suspended" | "service_stopped";

type AccessBrowseView =
  | { step: "classes" }
  | { step: "students"; groupKey: string };

const STATUS_META: Record<
  AccountStatus,
  { label: string; description: string; badge: string }
> = {
  active: {
    label: "Active",
    description: "Full access to live classes, lectures, and practice.",
    badge: "bg-emerald-500/10 text-emerald-400",
  },
  suspended: {
    label: "Suspended",
    description: "Login blocked. Use for temporary holds or policy violations.",
    badge: "bg-amber-500/10 text-amber-400",
  },
  service_stopped: {
    label: "Service stopped",
    description: "Access ended. Use when enrollment or billing is discontinued.",
    badge: "bg-red-500/10 text-red-400",
  },
};

function studentStatus(user: User): AccountStatus {
  const status = user.account_status ?? (user.is_active ? "active" : "suspended");
  if (status === "suspended" || status === "service_stopped") return status;
  return "active";
}

function studentPathLabel(user: User): string {
  if (user.program && user.program !== "school") {
    return formatPathLabel(user.program as Program, user.exam_track ?? "");
  }
  if (user.class_grade) return `Class ${user.class_grade}`;
  return "School";
}

export default function AdminStudentAccessPage() {
  const adminUser = getStoredUser();
  const adminProgram = normalizeProgram(adminUser?.program);

  const [students, setStudents] = useState<User[]>([]);
  const [browseView, setBrowseView] = useState<AccessBrowseView>({ step: "classes" });
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");

  const classGroups = useMemo(
    () => listStudentDomainGroups(adminProgram, students).filter((g) => (g.studentCount ?? 0) > 0),
    [adminProgram, students]
  );

  const classStudents = useMemo(() => {
    if (browseView.step !== "students") return [];
    return studentsInDomainGroup(students, adminProgram, browseView.groupKey);
  }, [students, adminProgram, browseView]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.students();
      setStudents(data);
      setNoteById((prev) => {
        const next = { ...prev };
        for (const s of data) {
          if (next[s.id] === undefined) next[s.id] = s.status_note ?? "";
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(console.error);
    if (!studentDomainUsesGroups(adminProgram)) {
      setBrowseView({ step: "students", groupKey: "*" });
    }
  }, [adminProgram, load]);

  const scopedStudents = browseView.step === "classes" ? students : classStudents;

  const filtered = useMemo(() => {
    const base = browseView.step === "classes" ? [] : classStudents;
    if (filter === "all") return base;
    return base.filter((s) => studentStatus(s) === filter);
  }, [browseView.step, classStudents, filter]);

  const counts = useMemo(() => {
    const tally = { all: classStudents.length, active: 0, suspended: 0, service_stopped: 0 };
    for (const s of classStudents) {
      tally[studentStatus(s)] += 1;
    }
    return tally;
  }, [classStudents]);

  async function setStatus(student: User, account_status: AccountStatus) {
    const note = noteById[student.id]?.trim();
    const confirmMessages: Record<AccountStatus, string> = {
      active: `Reactivate ${student.full_name}? They will regain full platform access.`,
      suspended: `Suspend ${student.full_name}? They will not be able to sign in.`,
      service_stopped: `Stop service for ${student.full_name}? They will lose platform access.`,
    };
    if (!window.confirm(confirmMessages[account_status])) return;

    setUpdatingId(student.id);
    setMessage("");
    try {
      const updated = await api.updateStudentStatus(student.id, {
        account_status,
        status_note: note || undefined,
      });
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setMessage(`${updated.full_name} is now ${STATUS_META[account_status].label.toLowerCase()}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "suspended", label: "Suspended" },
    { key: "service_stopped", label: "Service stopped" },
  ];

  function browseTitle(): string {
    if (browseView.step === "classes") {
      return isSchoolProgram(adminProgram) ? "Classes" : "Groups";
    }
    if (isSchoolProgram(adminProgram)) return `Class ${browseView.groupKey}`;
    const group = classGroups.find((g) => g.key === browseView.groupKey);
    return group?.label ?? "Students";
  }

  function openGroup(groupKey: string) {
    setFilter("all");
    setMessage("");
    setBrowseView({ step: "students", groupKey });
  }

  function browseBack() {
    setFilter("all");
    setMessage("");
    setBrowseView({ step: "classes" });
  }

  return (
    <DashboardShell title="Student Access">
      <div className="glass rounded-xl p-6">
        <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {browseView.step === "students" && studentDomainUsesGroups(adminProgram) && (
                <button
                  type="button"
                  onClick={browseBack}
                  className="rounded-md border border-white/10 p-1.5 text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                  title="Back to classes"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              )}
              <h2 className="text-base font-semibold tracking-tight text-slate-100">
                {browseView.step === "classes" ? "Account access control" : browseTitle()}
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              {browseView.step === "classes"
                ? isSchoolProgram(adminProgram)
                  ? "Select a class to manage student access — suspend accounts or stop service when enrollment ends."
                  : "Select a group to manage student access."
                : "Suspend students temporarily or stop service when enrollment ends. Blocked accounts cannot sign in or use live classes, lectures, or practice."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 self-start rounded-md border border-white/10 px-3 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {browseView.step === "classes" ? (
          loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : classGroups.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
              {scopedStudents.length === 0
                ? "No students enrolled yet. Add students from the Students page."
                : "No class groups with enrolled students yet."}
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
              {classGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => openGroup(group.key)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                    <GraduationCap className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-100">{group.label}</p>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                        {group.studentCount} student{group.studentCount === 1 ? "" : "s"}
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
          )
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                    filter === item.key
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
                      : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                  }`}
                >
                  {item.label}
                  <span className="ml-1.5 text-slate-500">({counts[item.key]})</span>
                </button>
              ))}
            </div>

            {message && (
              <p className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-slate-300">
                {message}
              </p>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                {classStudents.length === 0
                  ? "No students in this class yet."
                  : "No students match this filter."}
              </p>
            ) : (
              <div className="scroll-area max-h-[560px] divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
                {filtered.map((student) => {
                  const status = studentStatus(student);
                  const meta = STATUS_META[status];
                  const busy = updatingId === student.id;

                  return (
                    <div key={student.id} className="px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-slate-100">{student.full_name}</p>
                            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">{student.email}</p>
                          <p className="mt-1 text-xs text-slate-600">{studentPathLabel(student)}</p>
                          {student.status_note && (
                            <p className="mt-2 text-xs text-slate-400">Note: {student.status_note}</p>
                          )}
                        </div>

                        <div className="w-full shrink-0 space-y-3 lg:w-80">
                          <div className="space-y-1.5">
                            <label className="section-label" htmlFor={`note-${student.id}`}>
                              Internal note
                            </label>
                            <input
                              id={`note-${student.id}`}
                              className="input-field text-sm"
                              placeholder="Reason for suspension or service stop"
                              value={noteById[student.id] ?? ""}
                              onChange={(e) =>
                                setNoteById((prev) => ({ ...prev, [student.id]: e.target.value }))
                              }
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {status !== "active" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatus(student, "active")}
                                className="rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                {busy ? "Updating…" : "Reactivate"}
                              </button>
                            )}
                            {status !== "suspended" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatus(student, "suspended")}
                                className="rounded-md border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50"
                              >
                                {busy ? "Updating…" : "Suspend"}
                              </button>
                            )}
                            {status !== "service_stopped" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setStatus(student, "service_stopped")}
                                className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                              >
                                {busy ? "Updating…" : "Stop service"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {(Object.keys(STATUS_META) as AccountStatus[]).map((key) => (
            <div key={key} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <p className="text-xs font-medium text-slate-300">{STATUS_META[key].label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{STATUS_META[key].description}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
