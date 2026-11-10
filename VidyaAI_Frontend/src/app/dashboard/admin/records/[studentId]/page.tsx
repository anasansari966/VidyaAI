"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StudentAnalytics } from "@/components/analytics/StudentAnalytics";
import { api } from "@/lib/api";
import { isSchoolProgram, normalizeProgram } from "@/lib/programs";
import type { MyStudentPerformanceAnalytics } from "@/types";
import { ArrowLeft, Download, Eye, FileText, Loader2 } from "lucide-react";

type ReportRow = {
  paper_id: number;
  title: string;
  subject: string;
  plan_label: string;
  score: number;
  total: number;
  percent: number;
  submitted_at: string | null;
};

export default function AdminStudentRecordDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = Number(params.studentId);
  const classKey = searchParams.get("class");
  const backHref = classKey
    ? `/dashboard/admin/records/class/${classKey}`
    : "/dashboard/admin/records";
  const backLabel = classKey
    ? classKey === "unassigned"
      ? "Back to Unassigned"
      : `Back to Class ${classKey}`
    : "Back to classes";
  const [performance, setPerformance] = useState<MyStudentPerformanceAnalytics | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(studentId)) {
      setError("Invalid student");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([api.adminStudentPerformance(studentId), api.adminStudentReports(studentId)])
      .then(([perf, reps]) => {
        if (cancelled) return;
        setPerformance(perf);
        setReports(reps);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load student");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  async function openPdf(
    target: { kind: "overall" } | { kind: "paper"; paperId: number },
    mode: "view" | "download"
  ) {
    setBusy(`${target.kind}-${"paperId" in target ? target.paperId : "all"}-${mode}`);
    setError("");
    try {
      await api.openAdminStudentPdf(studentId, target, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open PDF");
    } finally {
      setBusy(null);
    }
  }

  const isSchool = isSchoolProgram(normalizeProgram(performance?.program));

  return (
    <DashboardShell title="Student Record">
      <div className="mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {performance?.full_name ?? (loading ? "Loading…" : "Student")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Individual analytics, per-test report cards, and PDF downloads.
            {performance?.class_grade ? ` · Class ${performance.class_grade}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => void openPdf({ kind: "overall" }, "view")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {busy?.startsWith("overall-") ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            View overall PDF
          </button>
          <button
            type="button"
            disabled={!!busy || loading}
            onClick={() => void openPdf({ kind: "overall" }, "download")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download overall PDF
          </button>
        </div>
      </section>

      <StudentAnalytics
        data={performance}
        isSchool={isSchool}
        loading={loading}
        heading="Student performance"
        emptyLabel="No practice or lecture activity yet for this student."
      />

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h3 className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
          <FileText className="h-4 w-4 text-sky-300" />
          Test report cards (PDF)
        </h3>
        <p className="mb-4 text-xs text-slate-400">
          Open any completed practice or mock test as a PDF with charts and chapter suggestions.
        </p>
        {loading ? (
          <p className="text-sm text-slate-400">Loading reports…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-slate-400">No completed tests yet for this student.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li
                key={report.paper_id}
                className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{report.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {report.plan_label} · {report.subject}
                    {report.submitted_at
                      ? ` · ${new Date(report.submitted_at).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-100">
                    {report.score}/{report.total} · {report.percent}%
                  </span>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void openPdf({ kind: "paper", paperId: report.paper_id }, "view")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View PDF
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      void openPdf({ kind: "paper", paperId: report.paper_id }, "download")
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </DashboardShell>
  );
}
