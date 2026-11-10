"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import type { Book } from "@/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Calendar, Trash2 } from "lucide-react";
import type { LectureSchedule } from "@/types";

const WEEKDAYS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

function formatScheduleTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSchedulePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [schedules, setSchedules] = useState<LectureSchedule[]>([]);
  const [classGrade, setClassGrade] = useState<number | "">("");
  const [subject, setSubject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [weeks, setWeeks] = useState(1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 2, 4]);
  const [duration, setDuration] = useState(40);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = () => {
    Promise.all([api.books({ program: "school" }), api.schedules()])
      .then(([bookList, scheduleList]) => {
        setBooks(bookList);
        setSchedules(scheduleList);
      })
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  const grades = useMemo(
    () => [...new Set(books.map((b) => b.class_grade))].sort((a, b) => a - b),
    [books]
  );

  const subjects = useMemo(() => {
    if (classGrade === "") return [];
    return [...new Set(books.filter((b) => b.class_grade === classGrade).map((b) => b.subject))];
  }, [books, classGrade]);

  const chapterCount = useMemo(() => {
    if (classGrade === "" || !subject) return 0;
    return books
      .filter((b) => b.class_grade === classGrade && b.subject === subject)
      .reduce((sum, b) => sum + b.chapters.length, 0);
  }, [books, classGrade, subject]);

  const previewCount = useMemo(() => {
    if (!startDate || daysOfWeek.length === 0) return 0;
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7 - 1);
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (daysOfWeek.includes(cursor.getDay() === 0 ? 6 : cursor.getDay() - 1)) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }, [startDate, weeks, daysOfWeek]);

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (classGrade === "" || !subject || !startDate || !startTime || daysOfWeek.length === 0) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await api.createSchedules({
        class_grade: Number(classGrade),
        subject,
        start_date: startDate,
        weeks,
        days_of_week: daysOfWeek,
        start_time: startTime,
        duration_minutes: duration,
      });
      setMessage(res.message);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not schedule class.");
    } finally {
      setLoading(false);
    }
  }

  async function removeSchedule(id: number) {
    if (!confirm("Delete this scheduled class?")) return;
    await api.deleteSchedule(id);
    load();
  }

  return (
    <DashboardShell title="Schedule Classes">
      <div className="grid w-full gap-6 xl:grid-cols-2">
        <form onSubmit={createSchedule} className="glass space-y-4 rounded-2xl p-5 md:p-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-400" />
            <h2 className="font-semibold">Schedule live lectures</h2>
          </div>
          <p className="text-sm text-slate-400">
            Pick class, subject, days, and start time. Chapters are assigned automatically in order
            across all sessions — no need to pick each chapter.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={classGrade === "" ? "" : String(classGrade)}
              onChange={(value) => {
                setClassGrade(value ? Number(value) : "");
                setSubject("");
              }}
              placeholder="Select class"
              options={grades.map((g) => ({ value: String(g), label: `Class ${g}` }))}
              aria-label="Class"
            />

            <Select
              value={subject}
              onChange={setSubject}
              placeholder="Select subject"
              disabled={classGrade === ""}
              options={subjects.map((s) => ({ value: s, label: s }))}
              aria-label="Subject"
            />
          </div>

          {chapterCount > 0 && (
            <p className="text-xs text-slate-500">
              {chapterCount} chapter{chapterCount !== 1 ? "s" : ""} will rotate automatically across sessions.
            </p>
          )}

          <div>
            <p className="mb-2 text-sm text-slate-400">Days of week</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    daysOfWeek.includes(day.value)
                      ? "bg-indigo-500 text-white"
                      : "bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm text-slate-400">
              Start date
              <input
                type="date"
                className="input-field mt-1"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-slate-400">
              Start time
              <input
                type="time"
                className="input-field mt-1"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-slate-400">
              Weeks
              <input
                type="number"
                min={1}
                max={52}
                className="input-field mt-1"
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="block text-sm text-slate-400">
            Duration per session (minutes)
            <input
              type="number"
              min={5}
              max={180}
              className="input-field mt-1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>

          {previewCount > 0 && (
            <p className="rounded-xl bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
              This will create <strong>{previewCount}</strong> live session{previewCount !== 1 ? "s" : ""}{" "}
              at {startTime} on selected days.
            </p>
          )}

          <Button type="submit" disabled={loading || daysOfWeek.length === 0}>
            {loading ? "Scheduling…" : "Schedule classes"}
          </Button>
          {message && <p className="text-sm text-indigo-300">{message}</p>}
        </form>

        <div className="glass rounded-2xl p-5 md:p-6">
          <h2 className="mb-4 font-semibold">Scheduled classes</h2>
          {!schedules.length ? (
            <p className="text-sm text-slate-400">No classes scheduled yet.</p>
          ) : (
            <ul className="max-h-[640px] space-y-3 overflow-y-auto">
              {schedules.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      Class {item.class_grade} · {item.subject}
                    </p>
                    <p className="text-sm text-slate-300">
                      Ch. {item.chapter_number}: {item.chapter_title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{formatScheduleTime(item.scheduled_at)}</p>
                    <span className="mt-2 inline-block rounded-full bg-white/5 px-2 py-0.5 text-xs capitalize text-slate-400">
                      {item.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSchedule(item.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
