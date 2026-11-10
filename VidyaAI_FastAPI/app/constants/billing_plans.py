"""India-only individual subscription plans (INR) with billing cycles."""

from __future__ import annotations

from typing import Any

# Monthly list prices. School institutional pricing is separate (₹79/seat).
INDIA_INDIVIDUAL_PLANS: dict[str, dict[str, Any]] = {
    "starter": {
        "id": "starter",
        "name": "Starter",
        "tagline": "Begin with AI-guided learning",
        "price_inr": 599,
        "currency": "INR",
        "period": "month",
        "country": "IN",
        "highlighted": False,
        "features": [
            "AI lectures & recordings",
            "Chapter practice tests",
            "Basic progress analytics",
            "Email support",
        ],
        "permissions": ["lectures", "recordings", "practice"],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "tagline": "Most popular for serious students",
        "price_inr": 1200,
        "currency": "INR",
        "period": "month",
        "country": "IN",
        "highlighted": True,
        "features": [
            "Everything in Starter",
            "Mock tests & written AI grading",
            "Doubt support with Ms. Vidya",
            "Parent WhatsApp report cards",
            "PDF report downloads",
        ],
        "permissions": ["schedule", "lectures", "recordings", "practice", "support"],
    },
    "elite": {
        "id": "elite",
        "name": "Elite",
        "tagline": "Maximum practice & priority help",
        "price_inr": 1999,
        "currency": "INR",
        "period": "month",
        "country": "IN",
        "highlighted": False,
        "features": [
            "Everything in Pro",
            "Priority AI evaluation",
            "All exam-style practice modes",
            "Priority parent alerts",
            "Dedicated onboarding help",
        ],
        "permissions": ["schedule", "lectures", "recordings", "practice", "support"],
    },
}

BILLING_CYCLES: dict[str, dict[str, Any]] = {
    "monthly": {
        "id": "monthly",
        "label": "Monthly",
        "short_label": "1 mo",
        "months": 1,
        "days": 30,
        "discount_percent": 0,
    },
    "quarterly": {
        "id": "quarterly",
        "label": "Quarterly",
        "short_label": "3 mo",
        "months": 3,
        "days": 90,
        "discount_percent": 8,
    },
    "half_year": {
        "id": "half_year",
        "label": "Half year",
        "short_label": "6 mo",
        "months": 6,
        "days": 182,
        "discount_percent": 12,
    },
    "yearly": {
        "id": "yearly",
        "label": "Yearly",
        "short_label": "12 mo",
        "months": 12,
        "days": 365,
        "discount_percent": 18,
    },
}

INDIVIDUAL_SCHOOL_NAME = "VidyaAI Individual Learners"
INDIVIDUAL_ORG_TYPE = "individual"
DEFAULT_CYCLE_ID = "monthly"


def get_cycle(cycle_id: str | None) -> dict[str, Any]:
    key = (cycle_id or DEFAULT_CYCLE_ID).strip().lower()
    cycle = BILLING_CYCLES.get(key)
    if not cycle:
        raise KeyError(cycle_id or DEFAULT_CYCLE_ID)
    return dict(cycle)


def list_billing_cycles() -> list[dict[str, Any]]:
    return [dict(cycle) for cycle in BILLING_CYCLES.values()]


def get_plan(plan_id: str) -> dict[str, Any]:
    plan = INDIA_INDIVIDUAL_PLANS.get(plan_id)
    if not plan:
        raise KeyError(plan_id)
    return dict(plan)


def quote_plan(plan_id: str, cycle_id: str | None = None) -> dict[str, Any]:
    plan = get_plan(plan_id)
    cycle = get_cycle(cycle_id)
    monthly = int(plan["price_inr"])
    list_price = monthly * int(cycle["months"])
    discount = int(cycle["discount_percent"])
    payable = int(round(list_price * (100 - discount) / 100))
    savings = max(0, list_price - payable)
    months = int(cycle["months"])
    return {
        **plan,
        "billing_cycle": cycle["id"],
        "cycle_label": cycle["label"],
        "months": months,
        "days": int(cycle["days"]),
        "monthly_inr": monthly,
        "list_price_inr": list_price,
        "price_inr": payable,
        "savings_inr": savings,
        "discount_percent": discount,
        "per_month_inr": int(round(payable / months)),
        "period": cycle["id"],
    }


def list_india_plans(cycle_id: str | None = None) -> list[dict[str, Any]]:
    return [quote_plan(plan_id, cycle_id) for plan_id in INDIA_INDIVIDUAL_PLANS]


def plan_permissions(plan_id: str | None) -> list[str]:
    if not plan_id:
        return []
    plan = INDIA_INDIVIDUAL_PLANS.get(plan_id)
    if not plan:
        return []
    return list(plan.get("permissions") or [])
