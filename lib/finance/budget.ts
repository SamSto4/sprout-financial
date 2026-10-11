// The 50/30/20 budgeting guideline: about 50% of take-home pay to needs,
// 30% to wants and 20% to savings and extra debt payments. It's a starting point, not a rule.

export type BudgetCategory = "needs" | "wants" | "savings"

export const BUDGET_TARGETS: Record<BudgetCategory, number> = {
  needs: 0.5,
  wants: 0.3,
  savings: 0.2,
}

export type BudgetLine = {
  category: BudgetCategory
  amount: number
  target: number
  /** Share of income, 0 to 1. */
  share: number
  /** Needs and wants are "over" above target; savings is "under" below target. */
  status: "on-track" | "over" | "under"
}

export type BudgetSummary = {
  income: number
  lines: BudgetLine[]
  /** Income not assigned to any category. Negative means spending more than income. */
  unassigned: number
}

function money(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function summarizeBudget(
  incomeInput: number,
  amounts: Record<BudgetCategory, number>
): BudgetSummary {
  const income = money(incomeInput)
  const categories: BudgetCategory[] = ["needs", "wants", "savings"]

  const lines = categories.map((category): BudgetLine => {
    const amount = money(amounts[category])
    const target = income * BUDGET_TARGETS[category]
    const share = income > 0 ? amount / income : 0

    let status: BudgetLine["status"] = "on-track"
    // A small tolerance so a few dollars either way still counts as on track.
    const tolerance = income * 0.02
    if (category === "savings") {
      if (amount < target - tolerance) status = "under"
    } else if (amount > target + tolerance) {
      status = "over"
    }

    return { category, amount, target, share, status }
  })

  const assigned = lines.reduce((sum, line) => sum + line.amount, 0)
  return { income, lines, unassigned: income - assigned }
}
