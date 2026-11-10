"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import type { AccessRole, School } from "@/types";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { setSchoolContextId } from "@/lib/schoolContext";
import { PROGRAM_LABELS, PROGRAMS, normalizeProgram } from "@/lib/programs";

const PROGRAM_OPTIONS = PROGRAMS.map((program) => ({
  value: program,
  label: PROGRAM_LABELS[program],
}));

function examTrackForProgram(program: string) {
  if (program === "jee") return "mains";
  if (program === "neet") return "medical";
  if (program === "govt") return "upsc";
  return undefined;
}

export default function SuperAdminSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [organizationType, setOrganizationType] = useState("school");
  const [defaultAccessRoleId, setDefaultAccessRoleId] = useState<number | "">("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminProgram, setAdminProgram] = useState("school");
  const [selectedSchool, setSelectedSchool] = useState<number | "">("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [enabledClasses, setEnabledClasses] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [studentLimits, setStudentLimits] = useState<Record<number, string>>({});
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [managingSchoolId, setManagingSchoolId] = useState<number | null>(null);

  const roleOptions = useMemo(
    () => accessRoles.map((role) => ({ value: String(role.id), label: role.name })),
    [accessRoles]
  );

  const roleNameById = useMemo(
    () => Object.fromEntries(accessRoles.map((role) => [role.id, role.name])),
    [accessRoles]
  );

  async function load() {
    const [schoolList, roles] = await Promise.all([api.adminSchools(), api.accessRoles()]);
    setSchools(schoolList);
    setAccessRoles(roles);
    if (!defaultAccessRoleId && roles.length > 0) {
      const fullAccess = roles.find((role) => role.name === "Full Access") ?? roles[0];
      setDefaultAccessRoleId(fullAccess.id);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function handleSchoolSelect(value: string) {
    const schoolId = Number(value);
    setSelectedSchool(schoolId);
    const school = schools.find((item) => item.id === schoolId);
    if (school) {
      setAdminProgram(normalizeProgram(school.organization_type));
    }
  }

  return (
    <DashboardShell title="Schools">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h2 className="mb-1 text-lg font-semibold">Create school</h2>
          <p className="mb-4 text-sm text-slate-500">
            Choose the program domain and default student access role so student panels work correctly.
          </p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!defaultAccessRoleId) {
                setError("Select a default student access role");
                return;
              }
              setError("");
              setCreatingSchool(true);
              try {
                await api.createSchool({
                  name,
                  organization_type: organizationType,
                  default_access_role_id: Number(defaultAccessRoleId),
                  address: address || undefined,
                  enabled_class_grades: enabledClasses,
                  student_limits: Object.fromEntries(
                    enabledClasses
                      .map((grade) => [grade, Number(studentLimits[grade] || 0)] as const)
                      .filter(([, cap]) => cap > 0)
                  ),
                });
                setName("");
                setAddress("");
                setOrganizationType("school");
                setEnabledClasses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
                setStudentLimits({});
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              } finally {
                setCreatingSchool(false);
              }
            }}
          >
            <input
              className="input-field"
              placeholder="School name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Select
              value={organizationType}
              onChange={setOrganizationType}
              placeholder="Program domain"
              options={PROGRAM_OPTIONS}
              aria-label="Program domain"
            />
            <Select
              value={defaultAccessRoleId ? String(defaultAccessRoleId) : ""}
              onChange={(value) => setDefaultAccessRoleId(Number(value))}
              placeholder="Default student access role"
              options={roleOptions}
              aria-label="Default student access role"
            />
            <input
              className="input-field"
              placeholder="Address (optional)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <div className="rounded-xl border border-white/10 p-3">
              <p className="mb-2 text-sm font-medium text-slate-200">Classes & student limits</p>
              <p className="mb-3 text-xs text-slate-500">
                Choose which classes this school can use. Set a max students per class — school admins cannot exceed it.
              </p>
              <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((grade) => {
                  const enabled = enabledClasses.includes(grade);
                  return (
                    <div
                      key={grade}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                        enabled ? "border-indigo-400/30 bg-indigo-500/5" : "border-white/10"
                      }`}
                    >
                      <label className="flex flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => {
                            setEnabledClasses((prev) =>
                              e.target.checked
                                ? [...prev, grade].sort((a, b) => a - b)
                                : prev.filter((g) => g !== grade)
                            );
                          }}
                        />
                        Class {grade}
                      </label>
                      <input
                        type="number"
                        min={0}
                        disabled={!enabled}
                        placeholder="Max"
                        className="input-field w-16 px-2 py-1 text-xs"
                        value={studentLimits[grade] ?? ""}
                        onChange={(e) =>
                          setStudentLimits((prev) => ({ ...prev, [grade]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <Button type="submit" loading={creatingSchool}>
              Add school
            </Button>
          </form>
        </div>

        <div className="glass rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold">Assign school admin</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedSchool) return;
              setError("");
              setCreatingAdmin(true);
              try {
                await api.createAdmin(selectedSchool, {
                  email: adminEmail,
                  password: adminPass,
                  full_name: adminName,
                  role: "admin",
                  program: adminProgram,
                  exam_track: examTrackForProgram(adminProgram),
                });
                setAdminEmail("");
                setAdminPass("");
                setAdminName("");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              } finally {
                setCreatingAdmin(false);
              }
            }}
          >
            <Select
              value={selectedSchool ? String(selectedSchool) : ""}
              onChange={handleSchoolSelect}
              placeholder="Select school"
              options={schools.map((s) => ({
                value: String(s.id),
                label: `${s.name} (${PROGRAM_LABELS[normalizeProgram(s.organization_type)]})`,
              }))}
              aria-label="School"
            />
            <Select
              value={adminProgram}
              onChange={setAdminProgram}
              placeholder="Admin domain"
              options={PROGRAM_OPTIONS}
              aria-label="Admin domain"
            />
            <p className="text-xs text-slate-500">
              Admin domain must match the school&apos;s program domain.
            </p>
            <input
              className="input-field"
              placeholder="Admin full name"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
            <input
              className="input-field"
              type="email"
              placeholder="Admin email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
            <PasswordInput
              placeholder="Password"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              required
              autoComplete="new-password"
            />
            <Button type="submit" loading={creatingAdmin}>
              Create admin
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-400">{success}</p>}

      <div className="glass mt-6 rounded-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold">All schools</h2>
        <div className="space-y-3">
          {schools.map((s) => (
            <div key={s.id} className="rounded-xl border border-white/5 px-4 py-3">
              {editId === s.id ? (
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setSavingEditId(s.id);
                    try {
                      await api.updateSchool(s.id, { name: editName });
                      setEditId(null);
                      await load();
                    } finally {
                      setSavingEditId(null);
                    }
                  }}
                >
                  <input
                    className="input-field flex-1"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                  <Button type="submit" loading={savingEditId === s.id}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditId(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-slate-400">
                      {PROGRAM_LABELS[normalizeProgram(s.organization_type)]}
                      {s.default_access_role_id
                        ? ` · Default role: ${roleNameById[s.default_access_role_id] ?? "Unknown"}`
                        : " · No default student role"}
                      {" · "}
                      {s.admin_count ?? 0} admins · {s.student_count ?? 0} students
                      {s.address ? ` · ${s.address}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      loading={managingSchoolId === s.id}
                      onClick={async () => {
                        setManagingSchoolId(s.id);
                        try {
                          setSchoolContextId(s.id);
                          window.dispatchEvent(new Event("vidyaai:school-context"));
                        } finally {
                          setManagingSchoolId(null);
                        }
                      }}
                    >
                      Manage as school
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditId(s.id);
                        setEditName(s.name);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-red-300 hover:text-red-200"
                      loading={deletingId === s.id}
                      disabled={s.name === "Demo International School"}
                      onClick={async () => {
                        const userCount = (s.admin_count ?? 0) + (s.student_count ?? 0);
                        const confirmed = confirm(
                          `Delete "${s.name}"?\n\nThis permanently removes the school${
                            userCount
                              ? `, ${userCount} user account(s), and all related data`
                              : " and all related data"
                          }. This cannot be undone.`
                        );
                        if (!confirmed) return;
                        setError("");
                        setSuccess("");
                        setDeletingId(s.id);
                        try {
                          const result = await api.deleteSchool(s.id);
                          setSuccess(
                            `${s.name} deleted (${result.users_removed} user(s), ${result.books_removed} book(s) removed).`
                          );
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Delete failed");
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
