// The money roadmap: the usual order of operations for someone starting to invest, with where the
// user stands on each step worked out from their profile. It follows the same order the assistant
// teaches (lib/ai/system-prompt.ts): emergency fund, high-interest debt, employer match,
// tax-advantaged accounts, then taxable investing. The emergency fund is split into a one-month
// starter buffer (first) and a fuller 3-6 month fund once expensive debt is gone.
// Pure and tested.

import { highInterestDebts, HIGH_INTEREST_APR, isUsCountry, type InvestorProfile } from "./profile.ts"

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

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

export function buildRoadmap(profile: InvestorProfile): Roadmap {
  const essentials = profile.monthlyEssentials
  const savings = profile.emergencySavings
  const us = isUsCountry(profile.country)
  const steps: RoadmapStep[] = []

  // 1. Starter buffer: one month of essential spending, or $1,000 when spending isn't known.
  {
    const target = essentials !== null && essentials > 0 ? essentials * STARTER_MONTHS : STARTER_FALLBACK
    const basis = essentials !== null && essentials > 0 ? "one month of essential spending" : `a ${money(STARTER_FALLBACK)} starting point`
    if (savings === null) {
      steps.push({
        id: "starter-buffer",
        title: "Build a starter cash buffer",
        status: "needs-info",
        detail: `Keep about ${basis} in savings for surprises. Add your emergency savings to see where you stand.`,
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
      steps.push({
        id: "full-emergency-fund",
        title: "Grow your emergency fund to 3-6 months",
        status: "needs-info",
        detail: "Add your emergency savings and monthly essential spending to size this.",
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
    nextAction: current ? nextAction(current, profile) : "Keep investing regularly and rebalance about once a year.",
  }
}

function nextAction(step: RoadmapStep, profile: InvestorProfile): string {
  switch (step.id) {
    case "starter-buffer":
      return step.status === "needs-info"
        ? "Add how much you have in emergency savings so we can size your starter buffer."
        : `Set up an automatic transfer to a high-yield savings account until you've added ${money(step.gap ?? 0)}.`
    case "high-interest-debt": {
      const [first] = highInterestDebts(profile)
      return `Pay the minimum on everything, and put every extra dollar toward ${first?.name ?? "your highest-rate debt"} first.`
    }
    case "employer-match":
      return step.status === "needs-info"
        ? "Ask HR or check your benefits portal: does your employer match retirement contributions, and up to what percent?"
        : "Raise your workplace retirement contribution to at least the percentage your employer matches."
    case "full-emergency-fund":
      return step.status === "needs-info"
        ? "Add your monthly essential spending and emergency savings to size your full emergency fund."
        : `Keep your automatic savings going until you've added ${money(step.gap ?? 0)}.`
    case "tax-advantaged":
      return isUsCountry(profile.country)
        ? "Open a Roth or traditional IRA (or use your 401(k)) and set up an automatic monthly contribution to a broad index fund."
        : "Look up the tax-advantaged retirement accounts in your country and open one with a low-cost provider."
    case "invest-more":
      return "Automate a monthly investment into a low-cost, diversified fund and leave it alone."
  }
}
