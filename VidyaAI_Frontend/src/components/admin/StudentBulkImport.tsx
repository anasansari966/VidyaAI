"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { isSchoolProgram, normalizeProgram } from "@/lib/programs";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

const CLASS_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `Class ${i + 1}`,
}));

export function StudentBulkImport({
  adminProgram,
  onComplete,
}: {
  adminProgram: string;
  onComplete: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [classGrade, setClassGrade] = useState("9");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isSchool = isSchoolProgram(adminProgram);
  const controlsDisabled = loading;

  function handleFileChange() {
    const file = fileRef.current?.files?.[0] ?? null;
    setSelectedFile(file);
    setError("");
    setMessage("");
  }

  async function handleUpload() {
    const file = selectedFile ?? fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first");
      return;
    }
    if (isSchool && !classGrade) {
      setError("Select a class before uploading");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (isSchool) form.append("class_grade", classGrade);

      const { warnings, importedCount, filename } = await api.bulkImportStudents(form);
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFile(null);

      const countLabel =
        importedCount != null
          ? `${importedCount} student${importedCount === 1 ? "" : "s"} imported`
          : "Students imported";
      const credentialNote = `Login credentials saved to ${filename} (no email drafts).`;
      const warningNote = warnings.length ? ` Warnings: ${warnings.join("; ")}` : "";

      setMessage(`${countLabel}. ${credentialNote}${warningNote}`);
      await onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative mt-6 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      {loading && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-slate-950/70 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
          <p className="mt-3 text-sm font-medium text-slate-200">
            Importing students and generating credentials…
          </p>
          {selectedFile && (
            <p className="mt-2 text-xs font-medium text-indigo-200">{selectedFile.name}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">This may take a moment for large files.</p>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-indigo-300" />
        <h3 className="text-sm font-semibold text-slate-100">Bulk import from Excel</h3>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Required columns: Student Name, Parents Number, Parents Name.
        Student ID, student password, and parent password are auto-generated.
        Optional columns: Student ID, Email, Student Password, Parents Password, Phone Number.
        {isSchool
          ? " Select the class first, then upload."
          : ` Imports into your ${normalizeProgram(adminProgram).toUpperCase()} domain.`}
        {" "}
        A credential Excel file with student and parent login IDs/passwords is downloaded after import.
      </p>

      {isSchool && (
        <div className="mb-3 max-w-xs">
          <Select
            value={classGrade}
            onChange={setClassGrade}
            placeholder="Select class"
            options={CLASS_OPTIONS}
            aria-label="Class for bulk import"
            disabled={controlsDisabled}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex max-w-full items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 ${
            controlsDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/10"
          }`}
        >
          <Upload className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{selectedFile ? selectedFile.name : "Choose Excel file"}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={controlsDisabled}
            onChange={handleFileChange}
          />
        </label>
        <Button type="button" onClick={handleUpload} disabled={controlsDisabled || !selectedFile}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            "Upload & generate credentials"
          )}
        </Button>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
