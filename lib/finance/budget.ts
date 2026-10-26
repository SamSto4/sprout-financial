// The 50/30/20 budgeting guideline: about 50% of take-home pay to needs,
// 30% to wants and 20% to savings and extra debt payments. It's a starting point, not a rule.

export type BudgetCategory = "needs" | "wants" | "savings"

export const BUDGET_TARGETS: Record<BudgetCategory, number> = {
  needs: 0.5,
  wants: 0.3,
  savings: 0.2,
}

/**
 * The planner's budget lines. Each belongs to one 50/30/20 group, so the guideline still compares
 * like with like. "needs", "wants" and "savings" keep their old keys, so budgets saved before the
 * other lines existed read the same (the new lines start at 0).
 */
export type BudgetItem = "needs" | "groceries" | "recurring" | "wants" | "misc" | "savings" | "investments"

export const BUDGET_ITEMS: readonly BudgetItem[] = ["needs", "groceries", "recurring", "wants", "misc", "savings", "investments"]

export const ITEM_GROUP: Record<BudgetItem, BudgetCategory> = {
  needs: "needs",
  groceries: "needs",
  recurring: "wants",
  wants: "wants",
  misc: "wants",
  savings: "savings",
  investments: "savings",
}

/** Adds the lines up into the three 50/30/20 groups. Missing or invalid amounts count as 0. */
export function groupBudget(items: Partial<Record<BudgetItem, number>>): Record<BudgetCategory, number> {
  const totals: Record<BudgetCategory, number> = { needs: 0, wants: 0, savings: 0 }
  for (const item of BUDGET_ITEMS) totals[ITEM_GROUP[item]] += money(items[item] ?? 0)
  return totals
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
