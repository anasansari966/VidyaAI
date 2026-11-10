"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { api, saveSession } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import { loadRazorpayScript } from "@/lib/razorpayCheckout";

type Cycle = {
  id: string;
  label: string;
  discount_percent: number;
};

type Plan = {
  id: string;
  name: string;
  tagline: string;
  price_inr: number;
  monthly_inr: number;
  list_price_inr: number;
  savings_inr: number;
  discount_percent: number;
  per_month_inr: number;
  cycle_label: string;
  highlighted: boolean;
  features: string[];
};

type Step = "details" | "otp" | "pay";

const BOARDS = ["CBSE", "ICSE", "State Board", "IB", "NIOS", "Other"];

const emptyForm = {
  full_name: "",
  class_grade: "9",
  phone: "",
  email: "",
  parent_name: "",
  parent_phone: "",
  school_name: "",
  city: "",
  board: "CBSE",
  password: "",
  confirm_password: "",
};

function RegisterPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState(params.get("cycle") || "monthly");
  const [planId, setPlanId] = useState(params.get("plan") || "pro");
  const [step, setStep] = useState<Step>("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [checkoutToken, setCheckoutToken] = useState("");
  const [resendWait, setResendWait] = useState(0);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    api
      .billingPlans(cycle)
      .then((data) => {
        setCycles(data.cycles);
        setPlans(data.plans);
        if (!data.plans.some((p) => p.id === planId) && data.plans[0]) {
          setPlanId(data.plans[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans"));
  }, [cycle, planId]);

  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = window.setTimeout(() => setResendWait((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendWait]);

  const selected = useMemo(() => plans.find((p) => p.id === planId) || plans[0], [plans, planId]);

  function field<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.registerIndividualStudent({
        plan_id: selected.id,
        billing_cycle: cycle,
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        class_grade: Number(form.class_grade) || 9,
        phone: form.phone.trim(),
        parent_name: form.parent_name.trim(),
        parent_phone: form.parent_phone.trim(),
        school_name: form.school_name.trim(),
        city: form.city.trim(),
        board: form.board,
      });
      if (result.needs_otp) {
        setStep("otp");
        setResendWait(60);
      } else if (result.checkout_token) {
        setCheckoutToken(result.checkout_token);
        setStep("pay");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.verifyRegisterOtp({ email: form.email.trim(), otp: otp.trim() });
      if (!result.checkout_token) throw new Error("Verification succeeded but checkout session is missing.");
      setCheckoutToken(result.checkout_token);
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendWait > 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.resendRegisterOtp(form.email.trim());
      if (!result.needs_otp && result.checkout_token) {
        setCheckoutToken(result.checkout_token);
        setStep("pay");
        return;
      }
      setResendWait(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setBusy(false);
    }
  }

  async function handlePay() {
    if (!selected || !checkoutToken) return;
    setBusy(true);
    setError("");
    try {
      const order = await api.billingCheckoutStart({
        plan_id: selected.id,
        billing_cycle: cycle,
        checkout_token: checkoutToken,
      });
      if (order.dev_bypass) {
        const session = await api.billingCheckoutVerify({
          razorpay_order_id: order.order_id,
          razorpay_payment_id: `pay_dev_${order.payment_id}`,
          razorpay_signature: "dev",
        });
        saveSession(session.access_token, session.user, session.refresh_token);
        router.push("/dashboard/student");
        return;
      }
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay checkout");
      const publicKey = order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
      if (!publicKey) throw new Error("Razorpay key is missing.");

      const rzp = new window.Razorpay({
        key: publicKey,
        amount: order.amount,
        currency: order.currency,
        name: PRODUCT_NAME,
        description: `${order.plan.name} · ${order.plan.cycle_label || cycle}`,
        order_id: order.order_id,
        prefill: order.prefill,
        theme: { color: "#0f766e" },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const session = await api.billingCheckoutVerify(response);
            saveSession(session.access_token, session.user, session.refresh_token);
            router.push("/dashboard/student");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Payment verification failed");
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Payment cancelled. Your registration is saved — you can pay when ready.");
          },
        },
      });
      rzp.on("payment.failed", (response: { error?: { description?: string } }) => {
        setBusy(false);
        setError(response?.error?.description || "Payment failed. Please try again.");
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy(false);
    }
  }

  return (
    <div className="login-page mesh-bg relative min-h-screen overflow-hidden">
      <div className="marketing-orb marketing-orb-1" aria-hidden />
      <div className="marketing-orb marketing-orb-2" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <BrandLogo href="/" height={64} />
          <div className="flex items-center gap-3 text-sm">
            <Link href="/pricing" className="text-slate-300 hover:text-white">
              Pricing
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
          <aside className="space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-teal-200">Student registration</p>
              <h1 className="mt-2 text-3xl font-bold text-white">Create your {PRODUCT_NAME} account</h1>
              <p className="mt-2 text-sm text-slate-400">
                Name, class, and mobile are mandatory. We save your details as a student lead, then verify email and take payment.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Billing period</p>
              <div className="grid grid-cols-2 gap-2">
                {cycles.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCycle(item.id)}
                    className={`rounded-xl px-3 py-2 text-left text-sm ${
                      cycle === item.id
                        ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
                        : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    <span className="block font-medium">{item.label}</span>
                    {item.discount_percent > 0 && (
                      <span className="text-[11px] text-teal-300">Save {item.discount_percent}%</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  className={`w-full rounded-2xl border p-4 text-left ${
                    plan.id === selected?.id
                      ? "border-teal-400/40 bg-teal-500/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{plan.name}</p>
                      <p className="text-xs text-slate-400">{plan.tagline}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">₹{plan.price_inr}</p>
                      <p className="text-[11px] text-slate-500">
                        {plan.cycle_label}
                        {plan.savings_inr > 0 ? ` · save ₹${plan.savings_inr}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="login-card rounded-3xl p-6 sm:p-8">
            <ol className="mb-6 grid grid-cols-3 gap-2 text-[11px] font-medium uppercase tracking-wide">
              {["Details", "OTP", "Pay"].map((label, index) => {
                const n = index + 1;
                const current = step === "details" ? 1 : step === "otp" ? 2 : 3;
                return (
                  <li
                    key={label}
                    className={`rounded-full px-2 py-1 text-center ${
                      n === current
                        ? "bg-teal-500/20 text-teal-100"
                        : n < current
                          ? "bg-white/10 text-slate-200"
                          : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {n}. {label}
                  </li>
                );
              })}
            </ol>

            {step === "details" && (
              <form className="space-y-6" onSubmit={(e) => void handleRegister(e)}>
                <fieldset className="space-y-3">
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <UserRound className="h-4 w-4 text-teal-300" />
                    Student details
                  </legend>
                  <label className="login-label" htmlFor="full_name">
                    Full name *
                  </label>
                  <input
                    id="full_name"
                    required
                    minLength={2}
                    className="login-input w-full"
                    placeholder="Rahul Sharma"
                    value={form.full_name}
                    onChange={(e) => field("full_name", e.target.value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="login-label" htmlFor="class_grade">
                        Class *
                      </label>
                      <select
                        id="class_grade"
                        required
                        className="login-input w-full"
                        value={form.class_grade}
                        onChange={(e) => field("class_grade", e.target.value)}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((grade) => (
                          <option key={grade} value={grade}>
                            Class {grade}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="login-label" htmlFor="phone">
                        Student mobile *
                      </label>
                      <div className="login-input-wrap">
                        <Phone className="login-input-icon" aria-hidden />
                        <input
                          id="phone"
                          required
                          inputMode="numeric"
                          className="login-input"
                          placeholder="10-digit number"
                          value={form.phone}
                          onChange={(e) => field("phone", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="login-label" htmlFor="email">
                    Email *
                  </label>
                  <div className="login-input-wrap">
                    <Mail className="login-input-icon" aria-hidden />
                    <input
                      id="email"
                      required
                      type="email"
                      className="login-input"
                      placeholder="student@email.com"
                      value={form.email}
                      onChange={(e) => field("email", e.target.value)}
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <Users className="h-4 w-4 text-teal-300" />
                    Parent / guardian
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="login-label" htmlFor="parent_name">
                        Parent name *
                      </label>
                      <input
                        id="parent_name"
                        required
                        minLength={2}
                        className="login-input w-full"
                        placeholder="Parent full name"
                        value={form.parent_name}
                        onChange={(e) => field("parent_name", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="login-label" htmlFor="parent_phone">
                        Parent mobile *
                      </label>
                      <input
                        id="parent_phone"
                        required
                        inputMode="numeric"
                        className="login-input w-full"
                        placeholder="10-digit number"
                        value={form.parent_phone}
                        onChange={(e) => field("parent_phone", e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <Building2 className="h-4 w-4 text-teal-300" />
                    School details
                  </legend>
                  <label className="login-label" htmlFor="school_name">
                    Current school *
                  </label>
                  <input
                    id="school_name"
                    required
                    minLength={2}
                    className="login-input w-full"
                    placeholder="School / coaching name"
                    value={form.school_name}
                    onChange={(e) => field("school_name", e.target.value)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="login-label" htmlFor="board">
                        Board *
                      </label>
                      <select
                        id="board"
                        required
                        className="login-input w-full"
                        value={form.board}
                        onChange={(e) => field("board", e.target.value)}
                      >
                        {BOARDS.map((board) => (
                          <option key={board} value={board}>
                            {board}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="login-label" htmlFor="city">
                        City *
                      </label>
                      <input
                        id="city"
                        required
                        minLength={2}
                        className="login-input w-full"
                        placeholder="City"
                        value={form.city}
                        onChange={(e) => field("city", e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
                    <Lock className="h-4 w-4 text-teal-300" />
                    Account password
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      required
                      type="password"
                      minLength={6}
                      className="login-input w-full"
                      placeholder="Create password *"
                      value={form.password}
                      onChange={(e) => field("password", e.target.value)}
                    />
                    <input
                      required
                      type="password"
                      minLength={6}
                      className="login-input w-full"
                      placeholder="Confirm password *"
                      value={form.confirm_password}
                      onChange={(e) => field("confirm_password", e.target.value)}
                    />
                  </div>
                </fieldset>

                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving details…
                    </span>
                  ) : (
                    <>
                      Save details & send OTP
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <form className="space-y-4" onSubmit={(e) => void handleVerifyOtp(e)}>
                <p className="text-sm text-slate-400">
                  We emailed a 6-digit code to <span className="text-white">{form.email}</span>.
                </p>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="login-input w-full text-center text-2xl tracking-[0.4em]"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>
                  {busy ? "Verifying…" : "Verify email"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-slate-400 hover:text-white disabled:opacity-50"
                  disabled={busy || resendWait > 0}
                  onClick={() => void handleResend()}
                >
                  {resendWait > 0 ? `Resend code in ${resendWait}s` : "Resend code"}
                </button>
              </form>
            )}

            {step === "pay" && selected && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-teal-400/20 bg-teal-500/10 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-teal-100">
                    <GraduationCap className="h-4 w-4" />
                    {selected.name} · {selected.cycle_label}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-white">₹{selected.price_inr}</p>
                  <p className="text-xs text-slate-400">
                    Effective ₹{selected.per_month_inr}/month
                    {selected.savings_inr > 0 ? ` · you save ₹${selected.savings_inr}` : ""}
                  </p>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="button" className="w-full" disabled={busy} onClick={() => void handlePay()}>
                  {busy ? "Opening Razorpay…" : `Pay ₹${selected.price_inr}`}
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
                  Secure Razorpay checkout
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="login-page min-h-screen" />}>
      <RegisterPageInner />
    </Suspense>
  );
}
