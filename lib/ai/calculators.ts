// Calculator tools for the agent. Each one is a thin wrapper around a tested function in
// lib/finance, so the model decides when to calculate and the code does the arithmetic.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

import { summarizeBudget } from "../finance/budget.ts"
import { GROWTH_LIMITS, projectGrowth } from "../finance/compound.ts"
import { exactDoublingYears, ruleOf72Years } from "../finance/doubling.ts"
import { FEE_LIMITS, projectWithFee } from "../finance/fees.ts"

/** Same shape as the SDK's tool definition, without importing the SDK. */
type ToolDefinition = {
  name: string
  description: string
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] }
}

const growthProperties = {
  principal: { type: "number", description: "Starting amount in dollars. Use 0 if none." },
  monthly_contribution: { type: "number", description: "Amount added at the end of each month." },
  annual_return_percent: { type: "number", description: "Assumed average yearly return, e.g. 7 for 7%." },
  years: { type: "integer", description: "How many years, 1 to 50." },
}

export const CALCULATOR_TOOLS: ToolDefinition[] = [
  {
    name: "compound_growth",
    description:
      "Project what savings or investments could grow to with a starting amount, monthly contributions and an assumed yearly return (monthly compounding). Use it whenever the user asks how much they'll have, or compares saving scenarios. Returns the final balance, total contributed, growth, and milestones.",
    input_schema: {
      type: "object",
      properties: growthProperties,
      required: ["principal", "monthly_contribution", "annual_return_percent", "years"],
    },
  },
  {
    name: "fee_impact",
    description:
      "Show how a yearly fund fee (expense ratio or advisory fee) reduces an investment's ending balance, optionally compared with a second fee. Use it for questions about fees, expense ratios, or comparing funds.",
    input_schema: {
      type: "object",
      properties: {
        ...growthProperties,
        fee_percent: { type: "number", description: "Yearly fee as a percentage, e.g. 0.5 for 0.5%." },
        compare_fee_percent: { type: "number", description: "Optional second fee to compare, e.g. 0.05." },
      },
      required: ["principal", "monthly_contribution", "annual_return_percent", "years", "fee_percent"],
    },
  },
  {
    name: "doubling_time",
    description:
      "How long money takes to double at a yearly return, using both the Rule of 72 shortcut and the exact calculation.",
    input_schema: {
      type: "object",
      properties: {
        annual_return_percent: { type: "number", description: "Yearly return, e.g. 6 for 6%." },
      },
      required: ["annual_return_percent"],
    },
  },
  {
    name: "budget_check",
    description:
      "Compare a monthly budget with the 50/30/20 guideline (needs / wants / savings and extra debt payments). Returns each category's share, the guideline amount, status, and any unassigned or overspent money.",
    input_schema: {
      type: "object",
      properties: {
        monthly_income: { type: "number", description: "Monthly take-home pay." },
        needs: { type: "number", description: "Monthly spending on needs: rent, groceries, utilities, minimum payments." },
        wants: { type: "number", description: "Monthly spending on wants." },
        savings: { type: "number", description: "Monthly savings, investing and extra debt payments." },
      },
      required: ["monthly_income", "needs", "wants", "savings"],
    },
  },
]

export type ToolOutcome = { content: string; isError: boolean }

class InputError extends Error {}

function readNumber(input: Record<string, unknown>, key: string, min: number, max: number, optional = false) {
  const value = input[key]
  if (value === undefined && optional) return undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new InputError(`${key} must be a number from ${min} to ${max}.`)
  }
  return value
}

function growthInputs(input: Record<string, unknown>) {
  return {
    principal: readNumber(input, "principal", 0, GROWTH_LIMITS.principal.max)!,
    monthlyContribution: readNumber(input, "monthly_contribution", 0, GROWTH_LIMITS.monthlyContribution.max)!,
    annualRatePercent: readNumber(input, "annual_return_percent", 0, GROWTH_LIMITS.annualRatePercent.max)!,
    years: Math.round(readNumber(input, "years", 1, GROWTH_LIMITS.years.max)!),
  }
}

const ASSUMPTION =
  "Assumes the same return every year with monthly compounding. Real returns vary and can be negative; inflation, fees and taxes aren't included unless stated."

/** Runs a calculator tool, or returns null if the name isn't a calculator. */
export function runCalculator(name: string, rawInput: unknown): ToolOutcome | null {
  if (!CALCULATOR_TOOLS.some((tool) => tool.name === name)) return null
  const input = typeof rawInput === "object" && rawInput !== null ? (rawInput as Record<string, unknown>) : {}

  try {
    switch (name) {
      case "compound_growth": {
        const inputs = growthInputs(input)
        const points = projectGrowth(inputs)
        const final = points[points.length - 1]
        const step = inputs.years <= 10 ? 1 : 5
        return ok({
          inputs,
          final,
          milestones: points.filter((point) => point.year > 0 && (point.year % step === 0 || point.year === inputs.years)),
          assumption: ASSUMPTION,
        })
      }
      case "fee_impact": {
        const inputs = growthInputs(input)
        const fee = readNumber(input, "fee_percent", FEE_LIMITS.min, FEE_LIMITS.max)!
        const compare = readNumber(input, "compare_fee_percent", FEE_LIMITS.min, FEE_LIMITS.max, true)
        const withFee = projectWithFee({ ...inputs, feePercent: fee })
        const compared = compare === undefined ? null : projectWithFee({ ...inputs, feePercent: compare })
        return ok({
          inputs,
          withFee: { feePercent: fee, ...withFee },
          ...(compared
            ? {
                compared: { feePercent: compare, ...compared },
                differenceInEndingBalance: Math.round(Math.abs(compared.balance - withFee.balance) * 100) / 100,
              }
            : {}),
          assumption: `${ASSUMPTION} The fee is subtracted from the yearly return, a close approximation of how fund fees work.`,
        })
      }
      case "doubling_time": {
        const rate = readNumber(input, "annual_return_percent", 0.1, 50)!
        return ok({
          annualReturnPercent: rate,
          ruleOf72Years: Math.round(ruleOf72Years(rate) * 10) / 10,
          exactYears: Math.round(exactDoublingYears(rate) * 10) / 10,
          assumption: "Assumes the same return every year, compounded yearly.",
        })
      }
      case "budget_check": {
        const income = readNumber(input, "monthly_income", 0, 10_000_000)!
        const amounts = {
          needs: readNumber(input, "needs", 0, 10_000_000)!,
          wants: readNumber(input, "wants", 0, 10_000_000)!,
          savings: readNumber(input, "savings", 0, 10_000_000)!,
        }
        return ok({ ...summarizeBudget(income, amounts), guideline: "50% needs, 30% wants, 20% savings. A starting point, not a rule." })
      }
    }
  } catch (error) {
    if (error instanceof InputError) return { content: `Invalid input: ${error.message}`, isError: true }
    throw error
  }
  return null
}

function ok(data: unknown): ToolOutcome {
  return { content: JSON.stringify(data), isError: false }
}
