import type { BudgetItem } from "@/lib/finance/budget"

/** What each budget line is called in the planner, with a hint of what goes in it. */
export const ITEM_LABELS: Record<BudgetItem, { name: string; hint: string }> = {
  needs: { name: "Housing & bills", hint: "Rent, utilities, insurance, transport, minimum debt payments" },
  groceries: { name: "Groceries", hint: "Food and household basics" },
  recurring: { name: "Monthly recurring charges", hint: "Subscriptions and memberships: streaming, apps, gym" },
  wants: { name: "Wants", hint: "Eating out, shopping, hobbies, travel" },
  misc: { name: "Misc", hint: "Gifts, one-offs and small surprises" },
  savings: { name: "Savings", hint: "Emergency fund, short-term goals, extra debt payments" },
  investments: { name: "Investments", hint: "Retirement accounts, brokerage, index funds" },
}
