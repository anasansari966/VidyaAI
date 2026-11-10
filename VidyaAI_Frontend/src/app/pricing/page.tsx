"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CreditCard, IndianRupee, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";

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

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .billingPlans(cycle)
      .then((data) => {
        setPlans(data.plans);
        setCycles(data.cycles);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans"))
      .finally(() => setLoading(false));
  }, [cycle]);

  const schoolNote = useMemo(
    () => "Schools: institutional pricing from ₹79 per student / month (contact sales).",
    []
  );

  return (
    <div className="login-page mesh-bg relative min-h-screen overflow-hidden">
      <div className="marketing-orb marketing-orb-1" aria-hidden />
      <div className="marketing-orb marketing-orb-2" aria-hidden />

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <BrandLogo href="/" height={72} />
          <div className="flex items-center gap-3 text-sm">
            <Link href="/register" className="font-medium text-teal-200 hover:text-teal-100">
              Register
            </Link>
            <Link href="/login" className="text-slate-300 hover:text-white">
              Sign in
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200 hover:bg-white/10"
            >
              Home
            </Link>
          </div>
        </div>

        <section className="mb-10 max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
            <IndianRupee className="h-3.5 w-3.5" />
            India only · Individual students
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Choose your {PRODUCT_NAME} plan
          </h1>
          <p className="mt-3 text-base text-slate-400">
            Pick a billing period, register with your details, verify email, then pay. Longer plans include a discount.
          </p>
          <p className="mt-2 text-sm text-slate-500">{schoolNote}</p>
        </section>

        <div className="mb-8 inline-flex flex-wrap rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {cycles.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCycle(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                cycle === item.id
                  ? "bg-teal-500/20 text-teal-100 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {item.label}
              {item.discount_percent > 0 && (
                <span className="ml-2 text-[11px] text-teal-300">-{item.discount_percent}%</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-slate-400">Loading plans…</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-3xl border p-6 ${
                  plan.highlighted
                    ? "border-teal-400/40 bg-teal-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-6 rounded-full bg-teal-400 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-950">
                    Most popular
                  </span>
                )}
                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
                <p className="mt-5 flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">₹{plan.price_inr}</span>
                  <span className="pb-1 text-sm text-slate-500">/ {plan.cycle_label.toLowerCase()}</span>
                </p>
                <p className="text-xs text-slate-500">
                  ₹{plan.per_month_inr}/month effective
                  {plan.savings_inr > 0 ? ` · save ₹${plan.savings_inr}` : ""}
                </p>
                {plan.list_price_inr > plan.price_inr && (
                  <p className="text-xs text-slate-600 line-through">₹{plan.list_price_inr}</p>
                )}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={`/register?plan=${plan.id}&cycle=${cycle}`} className="mt-6 block">
                  <Button type="button" className="w-full">
                    Register & get {plan.name}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </article>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-teal-300" />
            Register before payment
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
            Email OTP + Razorpay
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-teal-300" />
            Quarterly, half-year & yearly discounts
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-teal-300" />
            UPI · Cards · Netbanking
          </span>
        </div>

        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
