"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import { SERVICE_PERMISSION_LABELS } from "@/lib/servicePermissions";
import type { AccessRole, ServicePermission } from "@/types";
import { Button } from "@/components/ui/Button";

export default function SuperAdminRolesPage() {
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [options, setOptions] = useState<Array<{ key: ServicePermission; label: string }>>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<ServicePermission[]>(["lectures", "recordings"]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [roleList, permissionOptions] = await Promise.all([
      api.accessRoles(),
      api.accessRoleOptions(),
    ]);
    setRoles(roleList);
    setOptions(permissionOptions);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  function togglePermission(key: ServicePermission) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setPermissions(["lectures", "recordings"]);
    setError("");
  }

  function startEdit(role: AccessRole) {
    setEditingId(role.id);
    setName(role.name);
    setDescription(role.description ?? "");
    setPermissions(role.permissions);
    setError("");
    setMessage("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await api.updateAccessRole(editingId, { name, description, permissions });
        setMessage("Role updated");
      } else {
        await api.createAccessRole({ name, description, permissions });
        setMessage("Role created");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save role");
    }
  }

  async function handleDelete(roleId: number) {
    if (!confirm("Delete this role? It must not be assigned to any student.")) return;
    setError("");
    try {
      await api.deleteAccessRole(roleId);
      if (editingId === roleId) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  return (
    <DashboardShell title="Access Roles">
      <p className="mb-6 max-w-2xl text-sm text-slate-400">
        Define which student services each role can use — lectures, practice, support, and more.
        Domain admins assign these roles when creating students.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <form onSubmit={handleSubmit} className="glass space-y-4 rounded-2xl p-5">
          <h2 className="text-lg font-semibold">{editingId ? "Edit role" : "Create role"}</h2>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[72px] w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-400">Allowed services</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(options.length ? options : Object.entries(SERVICE_PERMISSION_LABELS).map(([key, label]) => ({ key: key as ServicePermission, label }))).map(
                (opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(opt.key)}
                      onChange={() => togglePermission(opt.key)}
                    />
                    {opt.label}
                  </label>
                )
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && <p className="text-sm text-emerald-400">{message}</p>}
          <div className="flex gap-2">
            <Button type="submit">{editingId ? "Save changes" : "Create role"}</Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>

        <div className="glass overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Services</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-white/5">
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-white">{role.name}</p>
                      {role.description && <p className="mt-1 text-xs text-slate-500">{role.description}</p>}
                      {role.is_system && (
                        <span className="mt-2 inline-block rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300">
                          System
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-200"
                          >
                            {SERVICE_PERMISSION_LABELS[perm]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="ghost" onClick={() => startEdit(role)}>
                          Edit
                        </Button>
                        {!role.is_system && (
                          <Button type="button" variant="ghost" onClick={() => handleDelete(role.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
