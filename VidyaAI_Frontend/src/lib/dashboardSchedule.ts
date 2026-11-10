/** Schedule helpers for advanced dashboards. */

export type ScheduleLike = {
  id: number;
  chapter_title: string;
  subject: string;
  class_grade: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  lecture_id: number | null;
  has_recording: boolean;
};

export function scheduleStart(s: ScheduleLike): Date {
  return new Date(s.scheduled_at);
}

export function scheduleEnd(s: ScheduleLike): Date {
  return new Date(scheduleStart(s).getTime() + Math.max(s.duration_minutes, 1) * 60_000);
}

export function isScheduleLive(s: ScheduleLike, now = new Date()): boolean {
  if (s.status === "live") return true;
  const start = scheduleStart(s);
  const end = scheduleEnd(s);
  return now >= start && now <= end && s.status !== "cancelled" && s.status !== "completed";
}

export function isScheduleUpcoming(s: ScheduleLike, now = new Date()): boolean {
  if (s.status === "cancelled" || s.status === "completed") return false;
  return scheduleStart(s) > now;
}

export function isScheduleToday(s: ScheduleLike, now = new Date()): boolean {
  const start = scheduleStart(s);
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

export function pickLiveSchedule(schedules: ScheduleLike[], now = new Date()): ScheduleLike | null {
  return schedules.find((s) => isScheduleLive(s, now)) ?? null;
}

export function pickNextSchedule(schedules: ScheduleLike[], now = new Date()): ScheduleLike | null {
  const upcoming = schedules
    .filter((s) => isScheduleUpcoming(s, now))
    .sort((a, b) => scheduleStart(a).getTime() - scheduleStart(b).getTime());
  return upcoming[0] ?? null;
}

export function formatScheduleWhen(s: ScheduleLike, now = new Date()): string {
  if (isScheduleLive(s, now)) return "Live now";
  const start = scheduleStart(s);
  const sameDay = isScheduleToday(s, now);
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  return start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
