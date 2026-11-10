"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/Select";
import type { Program } from "@/lib/programs";
import { PROGRAMS } from "@/lib/programs";
import {
  defaultExamTrack,
  defaultSubject,
  formatPathLabel,
  getSubjectsForPath,
  PROGRAM_CATALOG,
  SCHOOL_SUBJECTS,
  type ProgramPathValue,
} from "@/lib/programCatalog";

type Step = "program" | "track" | "details";

export function ProgramPathPicker({
  value,
  onChange,
  compact = false,
  lockedProgram,
  lockedExamTrack,
  hideSubject = false,
}: {
  value: ProgramPathValue;
  onChange: (next: ProgramPathValue) => void;
  compact?: boolean;
  lockedProgram?: Program;
  lockedExamTrack?: string;
  /** When true, skip subject — student is enrolled for the whole class / track. */
  hideSubject?: boolean;
}) {
  const [step, setStep] = useState<Step>("program");
  const [animKey, setAnimKey] = useState(0);

  const activeProgram = lockedProgram ?? value.program;
  const def = PROGRAM_CATALOG[activeProgram];
  const tracks = def.tracks;
  const subjects = getSubjectsForPath(activeProgram, value.examTrack, value.classGrade);
  const showTrackStep =
    activeProgram !== "school" && tracks.length > 1 && !lockedExamTrack;
  const showDetailsStep = activeProgram === "school" || !hideSubject;
  const steps: Step[] = lockedProgram
    ? [
        ...(showTrackStep && !value.examTrack ? (["track"] as const) : []),
        ...(showDetailsStep ? (["details"] as const) : []),
      ]
    : [
        "program",
        ...(showTrackStep ? (["track"] as const) : []),
        ...(showDetailsStep ? (["details"] as const) : []),
      ];
  const stepIndex = Math.max(0, steps.indexOf(step));

  useEffect(() => {
    if (lockedProgram && value.program !== lockedProgram) {
      const examTrack = lockedExamTrack || defaultExamTrack(lockedProgram);
      onChange({
        ...value,
        program: lockedProgram,
        examTrack,
        subject: defaultSubject(lockedProgram, examTrack),
      });
    }
  }, [lockedProgram, lockedExamTrack, onChange, value]);

  useEffect(() => {
    if (lockedExamTrack && value.examTrack !== lockedExamTrack) {
      onChange({
        ...value,
        examTrack: lockedExamTrack,
        subject: defaultSubject(activeProgram, lockedExamTrack),
      });
    }
  }, [activeProgram, lockedExamTrack, onChange, value]);

  useEffect(() => {
    if (activeProgram === "school") setStep("details");
    else if (showTrackStep && !value.examTrack) setStep("track");
    else if (showDetailsStep) setStep("details");
    else if (showTrackStep) setStep("track");
    else setStep("program");
  }, [activeProgram, showTrackStep, showDetailsStep, value.examTrack]);

  function bumpAnim() {
    setAnimKey((k) => k + 1);
  }

  function editPath() {
    if (lockedProgram) {
      if (showTrackStep) setStep("track");
      else if (showDetailsStep) setStep("details");
    } else {
      setStep("program");
    }
    bumpAnim();
  }

  function selectProgram(program: Program) {
    const examTrack = defaultExamTrack(program);
    const subject = program === "school" ? SCHOOL_SUBJECTS[0] : defaultSubject(program, examTrack);
    onChange({
      program,
      examTrack,
      classGrade: value.classGrade || 9,
      subject,
    });
    bumpAnim();
    if (program === "school") setStep("details");
    else if (PROGRAM_CATALOG[program].tracks.length > 1) setStep("track");
    else if (!hideSubject) setStep("details");
  }

  function selectTrack(examTrack: string) {
    onChange({
      ...value,
      examTrack,
      subject: defaultSubject(value.program, examTrack),
    });
    bumpAnim();
    if (!hideSubject) setStep("details");
  }

  const detailsStepLabel =
    hideSubject && activeProgram === "school"
      ? "Class"
      : hideSubject
        ? "Path"
        : "Subject";

  return (
    <div className={`space-y-5 ${compact ? "" : "rounded-lg border border-white/[0.08] bg-black/20 p-5"}`}>
      {steps.length > 0 && (
        <div className="flex items-center gap-0">
          {steps.map((s, i) => (
            <div key={s} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      i <= stepIndex
                        ? "bg-indigo-600 text-white"
                        : "border border-white/15 bg-white/[0.03] text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`truncate text-xs font-medium ${
                      i === stepIndex ? "text-slate-100" : i < stepIndex ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {s === "program" ? "Learning path" : s === "track" ? "Exam type" : detailsStepLabel}
                  </span>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-3 mt-[-14px] h-px flex-1 ${i < stepIndex ? "bg-indigo-600/60" : "bg-white/10"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {value.program && step !== "program" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] pb-4 text-xs text-slate-400">
          <button
            type="button"
            onClick={editPath}
            className="font-medium text-slate-300 transition hover:text-white"
          >
            {def.label}
          </button>
          {activeProgram !== "school" && value.examTrack && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
              <span>{formatPathLabel(activeProgram, value.examTrack).split("·")[1]?.trim()}</span>
            </>
          )}
          {step === "details" && activeProgram === "school" && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
              <span className="text-slate-300">Class {value.classGrade}</span>
            </>
          )}
          {step === "details" && !hideSubject && value.subject && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />
              <span className="text-slate-300">{value.subject}</span>
            </>
          )}
          <button
            type="button"
            onClick={editPath}
            className="ml-auto text-indigo-400 transition hover:text-indigo-300"
          >
            Edit
          </button>
        </div>
      )}

      {step === "program" && !lockedProgram && (
        <div key={`program-${animKey}`} className="picker-slide-up grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROGRAMS.map((p) => {
            const item = PROGRAM_CATALOG[p];
            const selected = value.program === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectProgram(p)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-indigo-500/50 bg-indigo-500/10"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                <p className="text-sm font-medium text-slate-100">{item.short}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {step === "track" && showTrackStep && (
        <div key={`track-${animKey}`} className="picker-slide-up space-y-2">
          <p className="section-label">Select exam type</p>
          <div className="scroll-area max-h-56 space-y-1.5">
            {tracks.map((track) => {
              const selected = value.examTrack === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => selectTrack(track.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-indigo-500/40 bg-indigo-500/10"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium text-slate-100">{track.label}</p>
                    {track.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{track.description}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === "details" && showDetailsStep && (
        <div key={`details-${animKey}`} className="picker-slide-up space-y-4">
          <div
            className={`grid gap-4 ${
              value.program === "school" && !hideSubject ? "sm:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {value.program === "school" && (
              <div className="space-y-1.5">
                <label className="section-label">Class</label>
                <Select
                  value={String(value.classGrade)}
                  onChange={(next) => onChange({ ...value, classGrade: Number(next) })}
                  options={Array.from({ length: 12 }, (_, i) => i + 1).map((g) => ({
                    value: String(g),
                    label: `Class ${g}`,
                  }))}
                  aria-label="Class"
                />
                {hideSubject && (
                  <p className="text-xs text-slate-500">
                    Student gets access to every subject available for this class.
                  </p>
                )}
              </div>
            )}

            {!hideSubject && (
              <div className="space-y-1.5">
                <label className="section-label">Subject</label>
                <Select
                  value={value.subject}
                  onChange={(next) => onChange({ ...value, subject: next })}
                  options={subjects.map((s) => ({ value: s, label: s }))}
                  aria-label="Subject"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
