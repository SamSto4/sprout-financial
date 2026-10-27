// Short progress notes for the app's own tools, shown under "Thinking" while an answer is being
// prepared, so people can see what the assistant is doing (and when it reads what they shared).
// Skill tools (web search, page reading, charts, tables) have theirs in skillStatus() in
// skill-tools.ts. Kept free of framework imports so it can be unit-tested with `node --test`.

const NOTES: Record<string, string> = {
  compound_growth: "Running the numbers",
  fee_impact: "Running the numbers",
  doubling_time: "Running the numbers",
  budget_check: "Checking the budget",
  search_companies: "Looking up companies",
  get_stock_quote: "Getting a market quote",
  get_company_profile: "Looking up the company",
  search_past_chats: "Searching your past chats",
  read_past_chat: "Reading a past chat",
  check_before_buying: "Going through the before-you-buy checklist",
  market_drop_history: "Looking at past market drops",
  get_my_plan: "Reading your plan",
  analyze_my_portfolio: "Checking your portfolio",
  plan_next_dollars: "Working out where extra money could go",
  get_finance_summary: "Reading your transactions",
  get_spending_trends: "Looking at your spending trends",
  find_transactions: "Searching your transactions",
}

/** The progress note for one of the app's tools, or undefined for a name it doesn't know. */
export function toolStatus(name: string): string | undefined {
  return Object.hasOwn(NOTES, name) ? NOTES[name] : undefined
}
