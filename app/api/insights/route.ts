import { isAgentConfigured, MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { generateInsights, InsightsError } from "@/lib/ai/insights"
import { MAX_TRANSACTIONS_REQUEST_BYTES, parseTransactions } from "@/lib/finance/transactions"
import { spendingLimitResponse } from "@/lib/ai/spend-server"
import { readJsonBody } from "@/lib/http/body"
import { rateLimitResponse } from "@/lib/rate-limit/server"

// Spending insights for the dashboard. The browser sends its imported transactions only when
// the user asks for a review; nothing is stored on the server.
export async function POST(request: Request) {
  // Capped while reading, before anything is parsed or counted (lib/http/body.ts).
  const body = await readJsonBody(request, MAX_TRANSACTIONS_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? jsonError("That's more transactions than a review can take.", 413)
      : jsonError("Request body must be valid JSON.", 400)
  }

  const transactions = parseTransactions((body.value as { transactions?: unknown } | null)?.transactions)
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
