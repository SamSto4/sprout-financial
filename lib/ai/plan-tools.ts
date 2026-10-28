// The assistant's plan and portfolio tools. Thin wrappers around tested functions in lib/plan and
// lib/portfolio: the model decides when to look, the code works out the numbers.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import type { ChatContext } from "../chat/validate.ts"
import { focusLabels } from "../plan/focus.ts"
import {
  EXPERIENCE,
  experienceChosen,
  GOALS,
  HORIZON_LABELS,
  horizonBand,
  missingDetails,
  profileCountryCode,
  profileCurrency,
  RISK_LABELS,
  riskLevel,
  targetStockRange,
} from "../plan/profile.ts"
import { buildRoadmap } from "../plan/roadmap.ts"
import { analyzePortfolio, nextDollars, rebalancePlan, stressTest } from "../portfolio/analyze.ts"
import { beforeYouBuy, type InstrumentFacts } from "../portfolio/buy-check.ts"
import { dropsAtLeast, MARKET_DROPS, MARKET_DROPS_SOURCE } from "../portfolio/history.ts"
import { normalizeSymbol } from "../portfolio/funds.ts"

type ToolDefinition = {
  name: string
  description: string
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] }
}

/** Offered while About you is on, or when the browser sent holdings. */
export const PLAN_TOOLS: ToolDefinition[] = [
  {
    name: "get_my_plan",
    description:
      "Read the exact figures in the user's own plan (About you and the My plan page): monthly income and essential spending, emergency savings, each debt's balance, rate and minimum payment, and their money roadmap with its amounts and next action, plus goal, horizon, risk quiz result, country and currency. The About the user summary already gives their roadmap step, risk level, target range and savings and debt as bands; call this only when an answer needs the exact amounts (a projection, a payoff time, how far they are from a target), instead of asking for numbers they've saved.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "analyze_my_portfolio",
    description:
      "Analyze the holdings the user entered on the Portfolio page: allocation by asset type, stock share against their target range, largest positions and concentration, overlapping funds, weighted fees and their 30-year cost, rebalancing with new money, and checks to act on. Use it for any question about their portfolio or holdings.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "plan_next_dollars",
    description:
      "Work out where the user's next amount of money could go, following their roadmap (starter buffer, high-interest debt, emergency fund, then investing split by their target mix or toward the underweight side). Use it for 'where should my next $X go', 'I have $500 extra this month' and similar. When the starter cash buffer can't be sized yet, the whole amount stays in savings and needsInfo names what to ask the user for.",
    input_schema: {
      type: "object",
      properties: { amount: { type: "number", description: "Amount to place, in the user's currency, e.g. 200." } },
      required: ["amount"],
    },
  },
]

/** Offered on every request. */
export const INVESTING_TOOLS: ToolDefinition[] = [
  {
    name: "check_before_buying",
    description:
      "Run the 'before you buy' checklist on a specific stock, fund or crypto the user is thinking about buying: what kind of investment it is, how big a slice of their portfolio it would become, how much it has swung over the past year, whether their foundations (cash buffer, high-interest debt) are in place, and questions to ask themselves. It never says buy or don't buy. Use it whenever someone asks 'should I buy X', 'is X a good investment' or shares a tip about a ticker.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, e.g. 'TSLA', 'VOO', 'BTC'." },
        amount: { type: "number", description: "Dollars they're thinking of putting in. Use 0 if they didn't say." },
      },
      required: ["symbol", "amount"],
    },
  },
  {
    name: "market_drop_history",
    description:
      "Past big US stock market falls (S&P 500) with how deep they went and how long the index took to recover, plus, when the user has entered holdings, what a fall of a given size would do to their portfolio. Use it when markets are falling, someone is scared or wants to sell, or asks 'what if the market crashes'.",
    input_schema: {
      type: "object",
      properties: {
        stock_drop_percent: { type: "number", description: "Size of fall to test against their portfolio, e.g. 30. Default 30." },
      },
    },
  },
]

export const PLAN_TOOL_NAMES = new Set([...PLAN_TOOLS, ...INVESTING_TOOLS].map((tool) => tool.name))

export type PlanToolOutcome = { content: string; isError: boolean }

const ok = (data: unknown): PlanToolOutcome => ({ content: JSON.stringify(data), isError: false })
const invalid = (message: string): PlanToolOutcome => ({ content: `Invalid input: ${message}`, isError: true })

function planSummary(context: ChatContext) {
  const profile = context.profile
  if (!profile) return null
  const level = riskLevel(profile.riskAnswers)
  const range = targetStockRange(profile)
  const currency = profileCurrency(profile)
  return {
    goal: GOALS[profile.goal],
    country: profile.country || "not given",
    countryCode: profileCountryCode(profile) ?? "not known",
    // The plan's amounts are in this currency (the roadmap's text is written in it too).
    currency: currency ?? "not known; the roadmap writes US dollars until it is",
    wantsHelpWith: focusLabels(profile.focus ?? []) || "not given",
    age: profile.age,
    horizon: profile.horizonYears === null ? "not given" : `${profile.horizonYears} years (${HORIZON_LABELS[horizonBand(profile.horizonYears)]})`,
    riskLevel: level ? RISK_LABELS[level] : "quiz not taken",
    experience: experienceChosen(profile) ? EXPERIENCE[profile.experience] : "not given",
    monthlyIncome: profile.monthlyIncome,
    monthlyEssentials: profile.monthlyEssentials,
    emergencySavings: profile.emergencySavings,
    debts: profile.debts.map(({ name, balance, aprPercent, minPayment }) => ({ name, balance, aprPercent, minPayment })),
    employerMatch: profile.employerMatch,
    hasTaxAdvantagedAccount: profile.hasTaxAdvantagedAccount,
    targetStockRange: range ? `${range.min}-${range.max}% stocks, the rest in bonds and cash (a rule-of-thumb range from horizon and risk quiz)` : "needs time horizon and risk quiz",
    roadmap: buildRoadmap(profile),
    missing: missingDetails(profile),
    savedAt: profile.updatedAt,
  }
}

/**
 * Runs a plan or investing tool. `facts` are the market facts for check_before_buying, looked up
 * by the caller (lib/ai/tools.ts) because that needs the network. Returns null for other tools.
 */
/**
 * Why there's no plan to read. With About you off (or not chosen) on this device the plan isn't
 * sent at all, even when the person has one, so the model mustn't tell them to fill one in; it
 * happens now that holdings can be shared on their own (the portfolio switch).
 */
function noPlan(context: ChatContext): PlanToolOutcome {
  return context.aboutYou === false
    ? {
        content:
          "The plan isn't shared on this device: About you is off or not chosen here, so it may exist but isn't sent. Don't say the user has no plan. Answer without it, and mention they can turn on About you in the assistant's sidebar (or fill in My plan, /plan, if they haven't).",
        isError: true,
      }
    : { content: "The user hasn't filled in their plan. Suggest the My plan page (/plan).", isError: true }
}

export function runPlanTool(name: string, input: unknown, context: ChatContext, facts?: InstrumentFacts): PlanToolOutcome | null {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>
  const range = context.profile ? targetStockRange(context.profile) : null

  switch (name) {
    case "get_my_plan": {
      const summary = planSummary(context)
      return summary ? ok(summary) : noPlan(context)
    }
    case "analyze_my_portfolio": {
      const analysis = analyzePortfolio(context.holdings, range)
      if (!analysis) return { content: "No holdings entered. Suggest the Portfolio page (/portfolio).", isError: true }
      const valuesAsOf = context.holdings.map((holding) => holding.valueAsOf).filter(Boolean).sort()[0] ?? "unknown"
      return ok({
        ...analysis,
        rebalance: rebalancePlan(analysis),
        holdings: context.holdings.map(({ symbol, name, assetClass, value, expenseRatioPercent }) => ({ symbol, name, assetClass, value, expenseRatioPercent })),
        valuesAsOf,
        note: "Values are as entered or last refreshed by the user, not live. Fees are only those the user entered.",
      })
    }
    case "plan_next_dollars": {
      const amount = args.amount
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
        return invalid("amount must be a positive number of dollars.")
      }
      if (!context.profile) return noPlan(context)
      return ok(nextDollars(amount, context.profile, analyzePortfolio(context.holdings, range)))
    }
    case "check_before_buying": {
      const symbol = normalizeSymbol(args.symbol)
      if (!symbol) return invalid("symbol must be a ticker like TSLA or VOO.")
      const amount = typeof args.amount === "number" && Number.isFinite(args.amount) ? Math.max(0, args.amount) : 0
      return ok(
        beforeYouBuy({
          facts: facts ?? { symbol, found: false },
          amount,
          holdings: context.holdings,
          roadmap: context.profile ? buildRoadmap(context.profile) : null,
          emergencySavings: context.profile?.emergencySavings ?? null,
        })
      )
    }
    case "market_drop_history": {
      const drop = typeof args.stock_drop_percent === "number" && Number.isFinite(args.stock_drop_percent) ? args.stock_drop_percent : 30
      const analysis = analyzePortfolio(context.holdings, range)
      return ok({
        drops: MARKET_DROPS,
        dropsAtLeastThisDeep: dropsAtLeast(drop).length,
        source: MARKET_DROPS_SOURCE,
        yourPortfolio: analysis ? stressTest(analysis, drop) : "No holdings entered, so there's no portfolio to test.",
      })
    }
    default:
      return null
  }
}
