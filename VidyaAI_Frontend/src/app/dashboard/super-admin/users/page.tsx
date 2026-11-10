"use client";

import { useEffect, useState } from "react";
import { Building2, Mail, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import { adminDomainLabel } from "@/lib/servicePermissions";
import { normalizeProgram, type Program } from "@/lib/programs";
import type { School, User } from "@/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

const DOMAIN_STYLES: Record<
  Program,
  { badge: string; avatar: string; dot: string }
> = {
  school: {
    badge: "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30",
    avatar: "bg-indigo-500/20 text-indigo-200 ring-indigo-500/30",
    dot: "bg-indigo-400",
  },
  jee: {
    badge: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
    avatar: "bg-amber-500/20 text-amber-200 ring-amber-500/30",
    dot: "bg-amber-400",
  },
  neet: {
    badge: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
    avatar: "bg-emerald-500/20 text-emerald-200 ring-emerald-500/30",
    dot: "bg-emerald-400",
  },
  govt: {
    badge: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30",
    avatar: "bg-rose-500/20 text-rose-200 ring-rose-500/30",
    dot: "bg-rose-400",
  },
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function accountStatus(user: User) {
  return user.account_status ?? (user.is_active ? "active" : "suspended");
}

function statusStyle(status: string) {
  if (status === "active") {
    return {
      label: "Active",
      className: "bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-500/25",
      dot: "bg-emerald-400",
    };
  }
  if (status === "suspended") {
    return {
      label: "Suspended",
      className: "bg-amber-500/12 text-amber-300 ring-1 ring-amber-500/25",
      dot: "bg-amber-400",
    };
  }
  return {
    label: "Service stopped",
    className: "bg-red-500/12 text-red-300 ring-1 ring-red-500/25",
    dot: "bg-red-400",
  };
}

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<number | "">("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    const [userList, schoolList] = await Promise.all([
      api.platformUsers({ school_id: schoolFilter || undefined }),
      api.adminSchools(),
    ]);
    setUsers(userList);
    setSchools(schoolList);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [schoolFilter]);

  const schoolName = (id: number | null) =>
    schools.find((s) => s.id === id)?.name ?? "—";

  async function updateStatus(userId: number, account_status: User["account_status"]) {
    setBusyId(userId);
    setError("");
    try {
      await api.updatePlatformUserStatus(userId, {
        account_status: account_status as "active" | "suspended" | "service_stopped",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAdmin(user: User) {
    const confirmed = confirm(
      `Delete admin ${user.full_name}?\n\nThey will be removed immediately and cannot log in again. All students under their domain will also lose login access.`
    );
    if (!confirmed) return;
    setBusyId(user.id);
    setError("");
    setSuccess("");
    try {
      const result = await api.deletePlatformUser(user.id);
      setSuccess(
        result.students_blocked > 0
          ? `${user.full_name} deleted. ${result.students_blocked} student account(s) blocked from login.`
          : `${user.full_name} deleted.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell title="Domain Admins">
      <p className="mb-5 max-w-2xl text-sm text-slate-400">
        Manage school and exam-track admins. Students stay under each domain admin.
      </p>

      <div className="glass mb-6 rounded-2xl p-4 md:max-w-md">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-500">
          Filter by school
        </label>
        <Select
          value={schoolFilter ? String(schoolFilter) : ""}
          onChange={(v) => setSchoolFilter(v ? Number(v) : "")}
          placeholder="All schools"
          options={schools.map((s) => ({ value: String(s.id), label: s.name }))}
          aria-label="Filter by school"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(DOMAIN_STYLES) as Program[]).map((program) => {
          const count = users.filter((u) => normalizeProgram(u.program) === program).length;
          const style = DOMAIN_STYLES[program];
          return (
            <span
              key={program}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${style.badge}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              {adminDomainLabel(program, null)} · {count}
            </span>
          );
        })}
      </div>

      <div className="space-y-3">
        {users.map((u) => {
          const program = normalizeProgram(u.program);
          const domain = DOMAIN_STYLES[program];
          const status = accountStatus(u);
          const statusUi = statusStyle(status);

          return (
            <article
              key={u.id}
              className="glass group rounded-2xl border border-white/[0.06] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.02] md:p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold ring-1 ${domain.avatar}`}
                  >
                    {initials(u.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-white">{u.full_name}</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusUi.className}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusUi.dot}`} />
                        {statusUi.label}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {u.email}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${domain.badge}`}>
                        {adminDomainLabel(u.program, u.exam_track)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Building2 className="h-3.5 w-3.5" />
                        {schoolName(u.school_id)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <div className="relative min-w-[160px]">
                    <Select
                      value={status}
                      onChange={(v) =>
                        updateStatus(u.id, v as User["account_status"])
                      }
                      options={[
                        { value: "active", label: "Active" },
                        { value: "suspended", label: "Suspended" },
                        { value: "service_stopped", label: "Service stopped" },
                      ]}
                      aria-label={`Status for ${u.full_name}`}
                      disabled={busyId === u.id}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    loading={busyId === u.id}
                    onClick={() => removeAdmin(u)}
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          );
        })}

        {users.length === 0 && (
          <div className="glass rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
            <p className="text-sm text-slate-400">No domain admins found for this filter.</p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
