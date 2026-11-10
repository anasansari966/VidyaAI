import { BarChart3, BookOpen, Calendar, CheckCircle2, Mic, Monitor, Upload, User, Users } from "lucide-react";
import { AI_TEACHER_NAME, PRODUCT_NAME } from "@/lib/brand";
import { TextbookPagePreview } from "./TextbookPagePreview";

type ShotProps = { className?: string; compact?: boolean };

function BrowserChrome({
  title,
  children,
  className = "",
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={`flex h-full flex-col overflow-hidden bg-[#090c12] ${className}`}>
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-[#0d1118] px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
          <span className="ml-1 truncate text-[10px] text-slate-500">{title}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">{children}</div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#090c12] shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1118] px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        <span className="ml-2 truncate text-[11px] text-slate-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function LiveClassAppShot({ className = "" }: ShotProps) {
  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Live Class · Class 9 Science`} className={className}>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
          <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Live · synced to schedule
            </span>
            <span>12:04 / 40:00</span>
          </div>
          <div className="flex flex-col items-center py-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/40 bg-gradient-to-br from-indigo-600 to-violet-700">
              <User className="h-9 w-9 text-white/90" />
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{AI_TEACHER_NAME}</p>
            <p className="text-xs text-emerald-300">Speaking…</p>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/10">
            <div className="h-full w-[30%] rounded-full bg-indigo-500" />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
            <Monitor className="h-3.5 w-3.5 text-cyan-400" />
            Page context
          </div>
          <TextbookPagePreview />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">Currently covering</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
            Is Matter Around Us Pure? — mixtures, solutions, and separation techniques.
          </p>
        </div>
      </div>
    </BrowserChrome>
  );
}

export function AdminPipelineAppShot({ className = "" }: ShotProps) {
  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Admin · Books & Lectures`}>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { label: "Students", value: "248", icon: Users },
            { label: "Books", value: "12", icon: BookOpen },
            { label: "Lectures", value: "86", icon: Mic },
            { label: "Live today", value: "4", icon: Calendar },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <stat.icon className="mb-1 h-3.5 w-3.5 text-indigo-400" />
              <p className="text-base font-bold text-white">{stat.value}</p>
              <p className="text-[10px] text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
              <Upload className="h-3.5 w-3.5 text-indigo-400" />
              Content library
            </div>
            {["Science · Class 9", "Mathematics · Class 10", "Physics · JEE"].map((row) => (
              <div key={row} className="mb-1.5 flex items-center justify-between rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-300">
                <span>{row}</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
              <Calendar className="h-3.5 w-3.5 text-cyan-400" />
              Today&apos;s schedule
            </div>
            {[
              "09:00 · Class 9 Science · LIVE",
              "11:30 · Class 10 Maths",
              "14:00 · JEE Physics",
            ].map((row) => (
              <div key={row} className="mb-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-slate-300">
                {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

export function AdminAnalyticsAppShot({ className = "", compact = false }: ShotProps) {
  const domainBars = [
    { label: "School", value: 62, color: "#6366f1" },
    { label: "JEE", value: 48, color: "#22c55e" },
    { label: "NEET", value: 35, color: "#f59e0b" },
    { label: "Govt", value: 22, color: "#06b6d4" },
  ];

  const examScores = [
    { label: "Chapter test", score: 78 },
    { label: "Mock paper", score: 71 },
    { label: "Practice", score: 84 },
  ];

  if (compact) {
    return (
      <BrowserChrome title={`${PRODUCT_NAME} · Performance`} compact className={className}>
        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="mb-2 text-[10px] font-semibold text-slate-100">Students by domain</p>
            <div className="space-y-1.5">
              {domainBars.map((row) => (
                <div key={row.label}>
                  <div className="mb-0.5 flex justify-between text-[9px]">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="text-slate-200">{row.value}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06]">
                    <div className="h-1 rounded-full" style={{ width: `${row.value}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="mb-2 text-[10px] font-semibold text-slate-100">Top performers</p>
            <div className="space-y-1.5">
              {[
                ["Aarav K.", "JEE", "92%"],
                ["Sneha M.", "NEET", "89%"],
                ["Rahul S.", "School", "87%"],
              ].map(([name, domain, avg]) => (
                <div key={name} className="flex items-center justify-between text-[9px] text-slate-300">
                  <span>{name}</span>
                  <span className="text-slate-500">{domain}</span>
                  <span className="text-emerald-300">{avg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Admin Dashboard · Performance`}>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-100">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              Students by domain
            </div>
            <div className="space-y-2">
              {domainBars.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="text-slate-200">{row.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06]">
                    <div className="h-1.5 rounded-full" style={{ width: `${row.value}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-100">
              <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
              Avg scores by exam type
            </div>
            <div className="space-y-2">
              {examScores.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-[10px]">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="text-slate-200">{row.score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06]">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${row.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-xs font-semibold text-slate-100">Top performers</div>
          <div className="overflow-hidden rounded-lg border border-white/[0.08]">
            <table className="w-full text-left text-[10px]">
              <thead className="bg-white/[0.02] text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Rank</th>
                  <th className="px-2 py-1.5 font-medium">Student</th>
                  <th className="px-2 py-1.5 font-medium">Domain</th>
                  <th className="px-2 py-1.5 font-medium">Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                {[
                  ["1", "Aarav K.", "JEE", "92%"],
                  ["2", "Sneha M.", "NEET", "89%"],
                  ["3", "Rahul S.", "School", "87%"],
                ].map(([rank, name, domain, avg]) => (
                  <tr key={rank}>
                    <td className="px-2 py-1.5">{rank}</td>
                    <td className="px-2 py-1.5">{name}</td>
                    <td className="px-2 py-1.5">{domain}</td>
                    <td className="px-2 py-1.5 text-emerald-300">{avg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

export function BookUploadAppShot({ className = "", compact = false }: ShotProps) {
  if (compact) {
    return (
      <BrowserChrome title={`${PRODUCT_NAME} · Upload Books`} compact className={className}>
        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="rounded-lg border border-dashed border-indigo-500/30 bg-indigo-500/5 p-4 text-center">
            <Upload className="mx-auto h-6 w-6 text-indigo-400" />
            <p className="mt-1.5 text-[11px] font-medium text-white">Upload curriculum PDF</p>
            <p className="mt-0.5 text-[9px] text-slate-400">Extract · classify · map visuals</p>
          </div>
          <div className="space-y-1.5">
            {[
              { title: "Science Class 9", chapters: "Intro + 12 chapters", status: "Ready" },
              { title: "Physics JEE Vol. 1", chapters: "24 chapters · 3 parts", status: "Processing" },
            ].map((book) => (
              <div key={book.title} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <div>
                  <p className="text-[10px] font-medium text-white">{book.title}</p>
                  <p className="text-[9px] text-slate-500">{book.chapters}</p>
                </div>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${book.status === "Ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                  {book.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Admin · Upload Books`}>
      <div className="p-4">
        <div className="rounded-xl border border-dashed border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
          <Upload className="mx-auto h-8 w-8 text-indigo-400" />
          <p className="mt-2 text-sm font-medium text-white">Upload curriculum PDF</p>
          <p className="mt-1 text-[11px] text-slate-400">Auto-extract pages · classify chapters · map visuals</p>
        </div>
        <div className="mt-3 space-y-2">
          {[
            { title: "Science Class 9", chapters: "Intro + 12 chapters", status: "Ready" },
            { title: "Physics JEE Vol. 1", chapters: "24 chapters · 3 parts", status: "Processing" },
          ].map((book) => (
            <div key={book.title} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div>
                <p className="text-xs font-medium text-white">{book.title}</p>
                <p className="text-[10px] text-slate-500">{book.chapters}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${book.status === "Ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                {book.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </BrowserChrome>
  );
}

export function LectureGenerateAppShot({ className = "", compact = false }: ShotProps) {
  if (compact) {
    return (
      <BrowserChrome title={`${PRODUCT_NAME} · Generate Lecture`} compact className={className}>
        <div className="flex flex-1 flex-col justify-between gap-3">
          <p className="text-[10px] font-medium text-slate-200">Science · Class 9 · Chapter 2</p>
          <div className="grid grid-cols-3 gap-1.5">
            {["Part 1", "Part 2", "Part 3"].map((part, i) => (
              <div
                key={part}
                className={`rounded-lg border px-1.5 py-2.5 text-center text-[10px] ${i === 0 ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
              >
                {part}
                <p className="mt-0.5 text-[8px] opacity-70">~40 min</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] text-slate-300">
              <Mic className="h-3 w-3 shrink-0 text-violet-400" />
              AI narration · synced audio · textbook visuals
            </div>
          </div>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Generate Lecture`}>
      <div className="p-4">
        <p className="text-xs font-medium text-slate-200">Science · Class 9 · Chapter 2</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Part 1", "Part 2", "Part 3"].map((part, i) => (
            <div
              key={part}
              className={`rounded-lg border px-2 py-3 text-center text-[11px] ${i === 0 ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}
            >
              {part}
              <p className="mt-1 text-[9px] opacity-70">~40 min</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <Mic className="h-3.5 w-3.5 text-violet-400" />
            AI narration · page-synced audio · textbook visuals
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
}

export function ScheduleAppShot({ className = "", compact = false }: ShotProps) {
  if (compact) {
    return (
      <BrowserChrome title={`${PRODUCT_NAME} · Schedule Class`} compact className={className}>
        <div className="flex flex-1 flex-col justify-between gap-3">
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {[
              ["Class", "Class 9 · Section A"],
              ["Subject", "Science"],
              ["Chapter", "Ch. 2 · Part 1"],
              ["Time", "Today · 09:00 AM"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <p className="text-[9px] text-slate-500">{label}</p>
                <p className="mt-0.5 font-medium text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[9px] leading-relaxed text-emerald-200">
            Late joiners sync to current minute — refresh-safe live playback
          </div>
        </div>
      </BrowserChrome>
    );
  }

  return (
    <BrowserChrome title={`${PRODUCT_NAME} · Schedule Live Class`}>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-slate-500">Class</p>
            <p className="mt-0.5 font-medium text-white">Class 9 · Section A</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-slate-500">Subject</p>
            <p className="mt-0.5 font-medium text-white">Science</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-slate-500">Chapter</p>
            <p className="mt-0.5 font-medium text-white">Ch. 2 · Part 1</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-slate-500">Time</p>
            <p className="mt-0.5 font-medium text-white">Today · 09:00 AM</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
          Late joiners sync to current minute — refresh-safe live playback
        </div>
      </div>
    </BrowserChrome>
  );
}
