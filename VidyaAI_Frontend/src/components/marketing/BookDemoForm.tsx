"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { COMPANY_NAME, PRODUCT_NAME } from "@/lib/brand";

const benefits = [
  "Live walkthrough of AI lectures synced to your textbooks",
  "Admin console: books, schedules, analytics & access control",
  "School · JEE · NEET · Govt tracks in one platform",
  "Pilot plan tailored to your institution size",
];

const roleOptions = [
  { value: "principal", label: "Principal / Head of School" },
  { value: "director", label: "Coaching Director" },
  { value: "admin", label: "IT / Operations Admin" },
  { value: "teacher", label: "Teacher / Academic Lead" },
  { value: "other", label: "Other" },
];

const programOptions = [
  { value: "school", label: "School (Class 1–12)" },
  { value: "jee", label: "JEE preparation" },
  { value: "neet", label: "NEET preparation" },
  { value: "govt", label: "Government exams" },
  { value: "multi", label: "Multiple programs" },
];

const sizeOptions = [
  { value: "1-100", label: "1 – 100 students" },
  { value: "101-500", label: "101 – 500 students" },
  { value: "501-2000", label: "501 – 2,000 students" },
  { value: "2000+", label: "2,000+ students" },
];

export function BookDemoForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [program, setProgram] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.submitDemoLead({
        full_name: fullName,
        email,
        phone,
        organization,
        role,
        program,
        student_count: studentCount || undefined,
        message: message || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="glass rounded-3xl border border-emerald-500/20 p-10 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Thank you — we&apos;ve received your request</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-400">
          Our team at {COMPANY_NAME} will contact you within 1–2 business days to schedule your
          personalized {PRODUCT_NAME} demo.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
        >
          Back to homepage
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
      <div className="flex flex-col justify-center">
        <p className="section-label mb-3">Book a demo</p>
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl xl:text-5xl">
          See {PRODUCT_NAME} in action at your institution
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Share a few details and we&apos;ll arrange a live demo — textbook upload, AI lectures, scheduled
          classes, and admin analytics tailored to your use case.
        </p>

        <ul className="mt-8 space-y-4">
          {benefits.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-slate-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            30-minute live session
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            No commitment required
          </span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass relative z-10 rounded-3xl border border-white/10 p-6 shadow-2xl shadow-indigo-950/20 sm:p-8"
      >
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-white">
          <Building2 className="h-4 w-4 text-indigo-400" />
          Tell us about your institution
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
              <User className="h-3.5 w-3.5" /> Full name *
            </span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Your name"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Mail className="h-3.5 w-3.5" /> Work email *
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@school.edu"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Phone className="h-3.5 w-3.5" /> Phone *
              </span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input-field"
                placeholder="+91 …"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Organization *</span>
            <input
              required
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="input-field"
              placeholder="School or coaching institute name"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Your role *</span>
              <select
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`book-demo-select ${role ? "text-slate-100" : "text-slate-500"}`}
              >
                <option value="" disabled hidden>
                  Select role
                </option>
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">Program interest *</span>
              <select
                required
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className={`book-demo-select ${program ? "text-slate-100" : "text-slate-500"}`}
              >
                <option value="" disabled hidden>
                  Select program
                </option>
                {programOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Approx. student count</span>
            <select
              value={studentCount}
              onChange={(e) => setStudentCount(e.target.value)}
              className={`book-demo-select ${studentCount ? "text-slate-100" : "text-slate-500"}`}
            >
              <option value="">Optional</option>
              {sizeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Anything else we should know?</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder="Goals, timeline, current tools…"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !role || !program}
          className="marketing-cta mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              Request my demo <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-slate-500">
          By submitting, you agree to be contacted by {COMPANY_NAME} about {PRODUCT_NAME}.
        </p>
      </form>
    </div>
  );
}
