"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PRODUCT_NAME } from "@/lib/brand";
import { api, saveSession, dashboardPath } from "@/lib/api";
import { ProgramPathPicker } from "@/components/programs/ProgramPathPicker";
import { SCHOOL_SUBJECTS, type ProgramPathValue } from "@/lib/programCatalog";
import { isSchoolProgram } from "@/lib/programs";
import type { UserRole } from "@/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

const roleLabels: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "School Admin",
  student: "Student",
  parent: "Parent",
};

type AuthFormProps =
  | { mode: "login" }
  | { mode: "signup"; role: UserRole };

export function AuthForm(props: AuthFormProps) {
  const router = useRouter();
  const mode = props.mode;
  const role = props.mode === "signup" ? props.role : undefined;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [path, setPath] = useState<ProgramPathValue>({
    program: "school",
    examTrack: "",
    classGrade: 9,
    subject: SCHOOL_SUBJECTS[0],
  });
  const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [superAdminAvailable, setSuperAdminAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode === "signup" && role !== "super_admin") {
      api.schools().then(setSchools).catch(() => setSchools([]));
    }
    if (mode === "signup" && role === "super_admin") {
      api
        .superAdminAvailable()
        .then((r) => setSuperAdminAvailable(r.available))
        .catch(() => setSuperAdminAvailable(null));
    }
  }, [mode, role]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await api.login(email, password);
        saveSession(res.access_token, res.user, res.refresh_token);
        router.push(dashboardPath(res.user.role));
      } else {
        const res = await api.register({
          email,
          password,
          full_name: fullName,
          role: role!,
          school_id: role === "super_admin" ? undefined : Number(schoolId) || undefined,
          program: role === "student" ? path.program : undefined,
          class_grade: role === "student" && isSchoolProgram(path.program) ? path.classGrade : undefined,
          exam_track: role === "student" && !isSchoolProgram(path.program) ? path.examTrack || undefined : undefined,
        });
        saveSession(res.access_token, res.user, res.refresh_token);
        router.push(dashboardPath(res.user.role));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <BrandLogo href="/" height={64} className="mb-6" />
        <h1 className="mb-1 text-2xl font-bold">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          {mode === "login"
            ? "Use your email and password — we route you to the right dashboard."
            : roleLabels[role!]}
        </p>

        {mode === "signup" && role === "super_admin" && superAdminAvailable === false && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-medium">Super admin already exists</p>
            <p className="mt-1 text-amber-200/80">
              Only one super admin is allowed.{" "}
              <Link href="/login" className="underline">
                Sign in
              </Link>{" "}
              with your existing credentials.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <input
              className="input-field"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}
          <input
            className="input-field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {mode === "signup" && role === "student" && (
            <ProgramPathPicker compact value={path} onChange={(next) => setPath(next)} />
          )}
          {mode === "signup" && role !== "super_admin" && (
            <Select
              value={schoolId === "" ? "" : String(schoolId)}
              onChange={(value) => setSchoolId(value ? Number(value) : "")}
              placeholder="Select your school"
              options={schools.map((s) => ({ value: String(s.id), label: s.name }))}
              aria-label="School"
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={
              loading ||
              (mode === "signup" && role === "super_admin" && superAdminAvailable === false)
            }
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link href="/" className="text-indigo-300 hover:underline">
                Choose a role to sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-300 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
