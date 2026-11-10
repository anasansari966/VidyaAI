"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Download, Eye, FileText, Loader2 } from "lucide-react";

export type ParentReportRow = {
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
};

export function ParentReportCards({
  studentId,
  refreshKey = 0,
}: {
  studentId: number | null;
  refreshKey?: number;
}) {
  const [reports, setReports] = useState<ParentReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!studentId) {
      setReports([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .parentChildReports(studentId)
      .then((rows) => {
        if (!cancelled) setReports(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load report cards");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, refreshKey]);

  async function openPdf(paperId: number, mode: "view" | "download") {
    if (!studentId) return;
    setBusyId(paperId);
    setError("");
    try {
      await api.openParentReportPdf(studentId, paperId, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open PDF");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FileText className="h-4 w-4 text-teal-300" aria-hidden />
            Report cards (PDF)
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Open or download practice and mock test report cards with charts, scores, and chapter
            suggestions.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading reports…
        </div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-slate-400">
          No completed tests yet. Report PDFs appear here after your child finishes a practice or mock
          test.
        </p>
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
                <span className="rounded-md bg-teal-500/15 px-2 py-1 text-xs font-semibold text-teal-100">
                  {report.score}/{report.total} · {report.percent}%
                </span>
                <button
                  type="button"
                  disabled={busyId === report.paper_id}
                  onClick={() => void openPdf(report.paper_id, "view")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {busyId === report.paper_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  )}
                  View PDF
                </button>
                <button
                  type="button"
                  disabled={busyId === report.paper_id}
                  onClick={() => void openPdf(report.paper_id, "download")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-400/20 bg-teal-500/10 px-2.5 py-1.5 text-xs text-teal-100 transition hover:bg-teal-500/20 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
