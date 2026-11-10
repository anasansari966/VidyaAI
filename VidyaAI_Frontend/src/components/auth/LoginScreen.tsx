"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AI_TEACHER_NAME, COMPANY_TAGLINE, PRODUCT_NAME } from "@/lib/brand";
import { api, dashboardPath, saveSession } from "@/lib/api";
import { Button } from "@/components/ui/Button";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      saveSession(res.access_token, res.user, res.refresh_token);
      router.push(dashboardPath(res.user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page mesh-bg relative min-h-screen overflow-hidden">
      <div className="marketing-orb marketing-orb-1" aria-hidden />
      <div className="marketing-orb marketing-orb-2" aria-hidden />
      <div className="marketing-grain pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 lg:flex-row lg:items-center lg:gap-16 lg:py-16">
        <section className="hero-fade mb-10 flex flex-1 flex-col justify-center lg:mb-0">
          <BrandLogo href="/" height={96} className="mb-8 lg:!h-[120px] lg:!w-[160px]" />
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI-powered learning platform
          </div>
          <h1 className="max-w-lg text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Welcome back to{" "}
            <span className="marketing-gradient-text">{PRODUCT_NAME}</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">
            Sign in to your dashboard — school admins, students, parents, and super admins
            each get a tailored experience with {AI_TEACHER_NAME} as your AI teacher.
          </p>

          <ul className="mt-8 hidden space-y-3 sm:block">
            {[
              { icon: Shield, text: "Secure role-based access for every user" },
              { icon: Zap, text: "Instant routing to the right dashboard" },
              { icon: Sparkles, text: "Live classes, practice & analytics in one place" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="h-4 w-4 text-indigo-300" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </section>

        <section className="hero-fade hero-delay-2 w-full flex-shrink-0 lg:max-w-md">
          <div className="login-card rounded-3xl p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white">Sign in</h2>
              <p className="mt-1 text-sm text-slate-400">
                Use student email, or parent mobile number, with your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="login-label">
                  Email or parent mobile
                </label>
                <div className="login-input-wrap">
                  <Mail className="login-input-icon" aria-hidden />
                  <input
                    id="login-email"
                    className="login-input"
                    type="text"
                    placeholder="you@school.edu or 9876543210"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="login-label">
                  Password
                </label>
                <div className="login-input-wrap">
                  <Lock className="login-input-icon" aria-hidden />
                  <input
                    id="login-password"
                    className="login-input pr-11"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-input-action"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <Button type="submit" className="login-submit w-full" disabled={loading}>
                {loading ? (
                  "Signing in…"
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </>
                )}
              </Button>
            </form>

            <Link
              href="/register"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-400/25 bg-teal-500/10 px-4 py-2.5 text-sm font-medium text-teal-100 transition hover:bg-teal-500/15"
            >
              New student? Register now
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-center text-sm text-slate-500">
              Compare plans first?{" "}
              <Link
                href="/pricing"
                className="font-medium text-indigo-300 transition hover:text-indigo-200"
              >
                View India pricing
              </Link>
            </p>
            <p className="mt-3 text-center text-sm text-slate-500">
              Or{" "}
              <Link href="/" className="font-medium text-slate-400 transition hover:text-slate-300">
                explore {PRODUCT_NAME}
              </Link>
            </p>
          </div>
        </section>
      </div>

      <p className="relative z-10 pb-8 text-center text-xs text-slate-600">{COMPANY_TAGLINE}</p>
    </div>
  );
}
