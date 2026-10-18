import { isAgentConfigured, MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { generateInsights, InsightsError } from "@/lib/ai/insights"
import { parseTransactions } from "@/lib/finance/transactions"
import { spendingLimitResponse } from "@/lib/ai/spend-server"
import { rateLimitResponse } from "@/lib/rate-limit/server"

// Spending insights for the dashboard. The browser sends its imported transactions only when
// the user asks for a review; nothing is stored on the server.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError("Request body must be valid JSON.", 400)
  }

  const transactions = parseTransactions((body as { transactions?: unknown } | null)?.transactions)
  if (transactions.length === 0) {
    return jsonError("Import some transactions first.", 400)
  }

  if (!isAgentConfigured()) {
    console.error("No API key: set CLAUDE_API_KEY in .env")
    return jsonError("The assistant isn't set up yet. Please try again later.", 503)
  }

  const overBudget = await spendingLimitResponse(MODEL)
  if (overBudget) return overBudget

  const limited = await rateLimitResponse("insights", request)
  if (limited) return limited

  try {
    const insights = await generateInsights(transactions)
    return Response.json({ insights }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof InsightsError) return jsonError(error.message, 502)
    return errorResponse(error)
  }
}
