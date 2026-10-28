// The money roadmap: the usual order of operations for someone starting to invest, with where the
// user stands on each step worked out from their profile. It follows the same order the assistant
// teaches (lib/ai/system-prompt.ts): emergency fund, high-interest debt, employer match,
// tax-advantaged accounts, then taxable investing. The emergency fund is split into a one-month
// starter buffer (first) and a fuller 3-6 month fund once expensive debt is gone.
// Pure and tested.

import { formatMoney } from "../format.ts"
import { fixedAmountsFit } from "./countries.ts"
import { highInterestDebts, HIGH_INTEREST_APR, isUsProfile, profileCurrency, type InvestorProfile } from "./profile.ts"

export type StepStatus = "done" | "current" | "todo" | "needs-info"

export type RoadmapStep = {
  id: "starter-buffer" | "high-interest-debt" | "employer-match" | "full-emergency-fund" | "tax-advantaged" | "invest-more"
  title: string
  status: StepStatus
  /** Plain-English state of this step, with the user's own figures. */
  detail: string
  /** Money still needed to finish the step, when it can be worked out. */
  gap: number | null
  /** The course lesson that explains it. */
  lesson: string
}

export type Roadmap = {
  steps: RoadmapStep[]
  /** The first unfinished step. */
  current: RoadmapStep | null
  /** How many steps are done. */
  done: number
  /** One concrete action for the current step. */
  nextAction: string
}

const STARTER_MONTHS = 1
export const FULL_FUND_MONTHS = 3
const STARTER_FALLBACK = 1000

/**
 * The starter buffer to aim for: one month of essential spending, or 1,000 when that isn't known
 * (or is saved as 0) and the person's currency is about dollar-sized. In other currencies (¥, ₹, kr) a fixed 1,000
 * would be far too little, so it's null until their essentials are known.
 */
export function starterBufferTarget(profile: InvestorProfile): number | null {
  const essentials = profile.monthlyEssentials
  if (essentials !== null && essentials > 0) return essentials * STARTER_MONTHS
  return fixedAmountsFit(profileCurrency(profile) ?? "USD") ? STARTER_FALLBACK : null
}

/**
 * Essentials saved as 0: an answer, never "not given" (the About the user summary says "given as
 * 0" too), but no number of months of it can size a fund. The starter buffer then uses its fixed
 * fallback where the currency has one; otherwise, and for the full fund, the person is asked to
 * check that figure rather than to add one.
 */
export function essentialsSavedAsZero(profile: Pick<InvestorProfile, "monthlyEssentials">): boolean {
  return profile.monthlyEssentials !== null && profile.monthlyEssentials <= 0
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function buildRoadmap(profile: InvestorProfile): Roadmap {
  const essentials = profile.monthlyEssentials
  const savings = profile.emergencySavings
  const us = isUsProfile(profile)
  // Amounts in the person's currency (US dollars until it's known).
  const currency = profileCurrency(profile) ?? "USD"
  const money = (value: number) => formatMoney(value, currency)
  const steps: RoadmapStep[] = []

  // 1. Starter buffer: one month of essential spending, or 1,000 when spending isn't known (only
  // in a currency where that's a sensible amount; starterBufferTarget).
  {
    const target = starterBufferTarget(profile)
    const basis = essentials !== null && essentials > 0 ? "one month of essential spending" : target !== null ? `a ${money(target)} starting point` : "one month of essential spending"
    if (savings === null || target === null) {
      steps.push({
        id: "starter-buffer",
        title: "Build a starter cash buffer",
        status: "needs-info",
        detail:
          savings === null
            ? target === null
              ? essentialsSavedAsZero(profile)
                ? `Keep about ${basis} in savings for surprises. Your monthly essentials are saved as 0, so check that figure, and add your emergency savings, to see where you stand.`
                : `Keep about ${basis} in savings for surprises. Add your emergency savings and monthly essentials to see where you stand.`
              : `Keep about ${basis} in savings for surprises. Add your emergency savings to see where you stand.`
            : essentialsSavedAsZero(profile)
              ? `You have ${money(savings)} saved. Keep about one month of essential spending for surprises: your monthly essentials are saved as 0, so check that figure to see where you stand.`
              : `You have ${money(savings)} saved. Keep about one month of essential spending for surprises: add your monthly essentials to see where you stand.`,
        gap: null,
        lesson: "/learn/money-foundation",
      })
    } else {
      const gap = Math.max(0, target - savings)
      steps.push({
        id: "starter-buffer",
        title: "Build a starter cash buffer",
        status: gap === 0 ? "done" : "todo",
        detail:
          gap === 0
            ? `You have ${money(savings)} saved, at least ${basis} (${money(target)}).`
            : `You have ${money(savings)} of a ${money(target)} starter buffer (${basis}). ${money(gap)} to go.`,
        gap: round2(gap),
        lesson: "/learn/money-foundation",
      })
    }
  }

  // 2. High-interest debt.
  {
    const expensive = highInterestDebts(profile)
    const total = expensive.reduce((sum, debt) => sum + debt.balance, 0)
    steps.push({
      id: "high-interest-debt",
      title: "Pay off high-interest debt",
      status: expensive.length === 0 ? "done" : "todo",
      detail:
        expensive.length === 0
          ? profile.debts.length === 0
            ? `No debts listed. Debt above about ${HIGH_INTEREST_APR}% a year is worth paying off before investing.`
            : `None of your debts charge ${HIGH_INTEREST_APR}% a year or more.`
          : `${money(total)} across ${expensive.length} ${expensive.length === 1 ? "debt" : "debts"} at ${HIGH_INTEREST_APR}%+ a year. Paying off ${expensive[0].name} (${expensive[0].aprPercent}%) first saves the most interest.`,
      gap: round2(total),
      lesson: "/learn/money-foundation",
    })
  }

  // 3. Employer match.
  {
    const status: StepStatus =
      profile.employerMatch === "capturing" || profile.employerMatch === "none"
        ? "done"
        : profile.employerMatch === "missing"
          ? "todo"
          : "needs-info"
    const detail = {
      capturing: "You're getting your full employer match. That's an instant return on the money you put in.",
      none: "No employer match to capture, so this step doesn't apply.",
      missing: "You're leaving part of your employer match unclaimed. Raising your contribution to the match level is often the best return available.",
      unsure: "Check whether your employer matches retirement contributions, and how much you need to put in to get all of it.",
    }[profile.employerMatch]
    steps.push({
      id: "employer-match",
      title: "Get your full employer match",
      status,
      detail,
      gap: null,
      lesson: "/learn/account-types",
    })
  }

  // 4. Full emergency fund.
  {
    if (savings === null || essentials === null || essentials <= 0) {
      const zero = essentialsSavedAsZero(profile)
      steps.push({
        id: "full-emergency-fund",
        title: "Grow your emergency fund to 3-6 months",
        status: "needs-info",
        detail: zero
          ? `Your monthly essentials are saved as 0, so 3 to 6 months of them can't size this: check that figure${savings === null ? " and add your emergency savings" : ""}.`
          : savings === null && essentials !== null
            ? "Add your emergency savings to size this."
            : "Add your emergency savings and monthly essential spending to size this.",
        gap: null,
        lesson: "/learn/money-foundation",
      })
    } else {
      const target = essentials * FULL_FUND_MONTHS
      const gap = Math.max(0, target - savings)
      const months = savings / essentials
      steps.push({
        id: "full-emergency-fund",
        title: "Grow your emergency fund to 3-6 months",
        status: gap === 0 ? "done" : "todo",
        detail:
          gap === 0
            ? `${money(savings)} covers about ${months.toFixed(1)} months of essentials.`
            : `${money(savings)} covers about ${months.toFixed(1)} months of essentials. ${money(gap)} more reaches 3 months (${money(target)}).`,
        gap: round2(gap),
        lesson: "/learn/money-foundation",
      })
    }
  }

  // 5. Tax-advantaged accounts.
  {
    const accounts = us ? "a Roth IRA, traditional IRA or workplace 401(k)" : "your country's tax-advantaged retirement or savings accounts"
    steps.push({
      id: "tax-advantaged",
      title: "Invest through tax-advantaged accounts",
      status: profile.hasTaxAdvantagedAccount === "yes" ? "done" : profile.hasTaxAdvantagedAccount === "no" ? "todo" : "needs-info",
      detail:
        profile.hasTaxAdvantagedAccount === "yes"
          ? `You have one. Keep contributing regularly, ideally automatically.`
          : `Accounts like ${accounts} let investments grow with tax breaks. Contribution limits change yearly, so check the current ones.`,
      gap: null,
      lesson: "/learn/account-types",
    })
  }

  // 6. Beyond that.
  steps.push({
    id: "invest-more",
    title: "Invest more in a regular brokerage account",
    status: "todo",
    detail: "Once the steps above are covered, extra money can go into low-cost, diversified funds in a taxable account.",
    gap: null,
    lesson: "/learn/starter-portfolio",
  })

  // The current step is the first one not done. "needs-info" counts as unfinished.
  const firstOpen = steps.findIndex((step) => step.status !== "done")
  if (firstOpen >= 0 && steps[firstOpen].status === "todo") steps[firstOpen] = { ...steps[firstOpen], status: "current" }
  const current = firstOpen >= 0 ? steps[firstOpen] : null

  return {
    steps,
    current,
    done: steps.filter((step) => step.status === "done").length,
    nextAction: current ? nextAction(current, profile, money) : "Keep investing regularly and rebalance about once a year.",
  }
}

function nextAction(step: RoadmapStep, profile: InvestorProfile, money: (value: number) => string): string {
  switch (step.id) {
    case "starter-buffer":
      return step.status === "needs-info"
        ? profile.emergencySavings === null
          ? starterBufferTarget(profile) !== null
            ? "Add how much you have in emergency savings so we can size your starter buffer."
            : essentialsSavedAsZero(profile)
              ? "Check your monthly essential spending in your plan: it's saved as 0, so it can't size your starter buffer. Add your emergency savings too."
              : "Add your emergency savings and monthly essential spending so we can size your starter buffer."
          : essentialsSavedAsZero(profile)
            ? "Check your monthly essential spending in your plan: it's saved as 0, so it can't size your starter buffer."
            : "Add your monthly essential spending so we can size your starter buffer."
        : `Set up an automatic transfer to a high-yield savings account until you've added ${money(step.gap ?? 0)}.`
    case "high-interest-debt": {
      const [first] = highInterestDebts(profile)
      return `Pay the minimum on everything, and put any extra money toward ${first?.name ?? "your highest-rate debt"} first.`
    }
    case "employer-match":
      return step.status === "needs-info"
        ? "Ask HR or check your benefits portal: does your employer match retirement contributions, and up to what percent?"
        : "Raise your workplace retirement contribution to at least the percentage your employer matches."
    case "full-emergency-fund":
      return step.status === "needs-info"
        ? essentialsSavedAsZero(profile)
          ? `Check your monthly essential spending in your plan: it's saved as 0, so it can't size your full emergency fund${profile.emergencySavings === null ? ". Add your emergency savings too" : ""}.`
          : profile.emergencySavings === null && profile.monthlyEssentials !== null
            ? "Add your emergency savings to size your full emergency fund."
            : "Add your monthly essential spending and emergency savings to size your full emergency fund."
        : `Keep your automatic savings going until you've added ${money(step.gap ?? 0)}.`
    case "tax-advantaged":
      return isUsProfile(profile)
        ? "Open a Roth or traditional IRA (or use your 401(k)) and set up an automatic monthly contribution to a broad index fund."
        : "Look up the tax-advantaged retirement accounts in your country and open one with a low-cost provider."
    case "invest-more":
      return "Automate a monthly investment into a low-cost, diversified fund and leave it alone."
  }
}
