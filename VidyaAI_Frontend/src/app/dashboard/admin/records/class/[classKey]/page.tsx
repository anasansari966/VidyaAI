"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Download,
  Eye,
  FileBarChart2,
  Loader2,
  Search,
  Trophy,
} from "lucide-react";

type RecordRow = {
  student_id: number;
  full_name: string;
  email: string;
  program: string;
  class_grade?: number | null;
  avg_score: number;
  attempts: number;
  best_mock_score: number | null;
  last_submitted_at: string | null;
};

export default function AdminClassRecordsPage() {
  const params = useParams();
  const classKey = String(params.classKey || "");
  const isUnassigned = classKey === "unassigned";
  const classGrade = isUnassigned ? null : Number(classKey);
  const classLabel = isUnassigned
    ? "Unassigned"
    : Number.isFinite(classGrade)
      ? `Class ${classGrade}`
      : "Class";

  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyStudentId, setBusyStudentId] = useState<number | null>(null);

  useEffect(() => {
    if (!classKey || (!isUnassigned && !Number.isFinite(classGrade))) {
      setError("Invalid class");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api
      .adminStudentRecords({
        classGrade: isUnassigned ? undefined : classGrade!,
        unassigned: isUnassigned,
      })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load class records"))
      .finally(() => setLoading(false));
  }, [classKey, classGrade, isUnassigned]);

  const topPerformers = useMemo(
    () => rows.filter((row) => row.attempts > 0).slice(0, 5),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.full_name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const classAvg = useMemo(() => {
    const attempted = rows.filter((row) => row.attempts > 0);
    if (!attempted.length) return null;
    return Math.round(
      (attempted.reduce((sum, row) => sum + row.avg_score, 0) / attempted.length) * 10
    ) / 10;
  }, [rows]);

  async function openClassBulk(mode: "view" | "download") {
    setBusy(true);
    setError("");
    try {
      await api.openAdminClassRecordsPdf(classKey, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open class PDF");
    } finally {
      setBusy(false);
    }
  }

  async function openStudentPdf(studentId: number, mode: "view" | "download") {
    setBusyStudentId(studentId);
    setError("");
    try {
      await api.openAdminStudentPdf(studentId, { kind: "overall" }, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open PDF");
    } finally {
      setBusyStudentId(null);
    }
  }

  return (
    <DashboardShell title={`${classLabel} Records`}>
      <div className="mb-5">
        <Link
          href="/dashboard/admin/records"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          All classes
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-500/10 via-white/[0.02] to-transparent px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/90">
              <FileBarChart2 className="h-3.5 w-3.5" aria-hidden />
              Selected class
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">{classLabel}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} students
              {classAvg != null ? ` · class average ${classAvg}%` : " · no attempts yet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || loading || rows.length === 0}
              onClick={() => void openClassBulk("view")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Bulk class PDF
            </button>
            <button
              type="button"
              disabled={busy || loading || rows.length === 0}
              onClick={() => void openClassBulk("download")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download bulk PDF
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-5">
        <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-amber-100">
          <Trophy className="h-4 w-4 text-amber-300" />
          Top performers in {classLabel}
        </h3>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : topPerformers.length === 0 ? (
          <p className="text-sm text-slate-400">No submitted practice results yet in this class.</p>
        ) : (
          <ol className="space-y-2">
            {topPerformers.map((row, index) => (
              <li
                key={row.student_id}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    #{index + 1}{" "}
                    <Link
                      href={`/dashboard/admin/records/${row.student_id}?class=${classKey}`}
                      className="hover:text-sky-200"
                    >
                      {row.full_name}
                    </Link>
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.attempts} attempts
                    {row.best_mock_score != null ? ` · best mock ${row.best_mock_score}%` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-100">{row.avg_score}%</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students in this class…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400/40"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} in list</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading students…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/[0.06] bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Avg score</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Best mock</th>
                <th className="px-4 py-3 font-medium">Last test</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filtered.map((row) => (
                <tr key={row.student_id} className="text-slate-300 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/admin/records/${row.student_id}?class=${classKey}`}
                      className="font-medium text-slate-100 hover:text-sky-200"
                    >
                      {row.full_name}
                    </Link>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`tabular-nums font-semibold ${
                        row.avg_score >= 70
                          ? "text-emerald-300"
                          : row.avg_score >= 40
                            ? "text-amber-300"
                            : "text-slate-300"
                      }`}
                    >
                      {row.attempts ? `${row.avg_score}%` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.attempts}</td>
                  <td className="px-4 py-3">
                    {row.best_mock_score != null ? `${row.best_mock_score}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {row.last_submitted_at
                      ? new Date(row.last_submitted_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/admin/records/${row.student_id}?class=${classKey}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        disabled={busyStudentId === row.student_id}
                        onClick={() => void openStudentPdf(row.student_id, "view")}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        disabled={busyStudentId === row.student_id}
                        onClick={() => void openStudentPdf(row.student_id, "download")}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No students in this class match the search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </DashboardShell>
  );
}
