import "server-only"

import { isKnownModel, isOverLimit, monthExpiry, monthKey, parseSpendingLimit, toMicroUsd } from "@/lib/ai/spend"
import { getDb, isDatabaseConfigured } from "@/lib/db/mongodb"

// The monthly spending limit (SPENDING_LIMIT, US dollars per calendar month across all visitors).
// Every AI call's estimated cost is added to the month's total; once it reaches the limit, the
// assistant and the spending review stop answering until the next month.
//
// The total is updated after each call finishes, so the last request of the month can go over by
// its own cost. Keep the spend limit on the API key in the Claude Console as the hard ceiling.

type SpendDocument = { _id: string; microUsd: number; expiresAt: Date }

/** Kept per server instance when MongoDB isn't configured or can't be reached. */
const memoryTotals = new Map<string, number>()

function limitUsd() {
  return parseSpendingLimit(process.env.SPENDING_LIMIT)
}

async function spending() {
  return (await getDb()).collection<SpendDocument>("spending")
}

/** This month's spending so far, in micro-dollars. Never throws: falls back to this instance's count. */
export async function spentThisMonth(now: number = Date.now()): Promise<number> {
  const key = monthKey(now)
  if (isDatabaseConfigured()) {
    try {
      const row = await (await spending()).findOne({ _id: key })
      return Math.max(row?.microUsd ?? 0, memoryTotals.get(key) ?? 0)
    } catch (error) {
      console.error("Spending total unavailable, using this instance's count:", error instanceof Error ? error.message : error)
    }
  }
  return memoryTotals.get(key) ?? 0
}

/** Adds a finished call's cost to the month's total. Never throws. */
export async function recordSpend(usd: number, now: number = Date.now()): Promise<void> {
  const micro = toMicroUsd(usd)
  if (micro === 0) return
  const key = monthKey(now)
  memoryTotals.set(key, (memoryTotals.get(key) ?? 0) + micro)
  if (!isDatabaseConfigured()) return
  const add = async () =>
    (await spending()).updateOne(
      { _id: key },
      { $inc: { microUsd: micro }, $setOnInsert: { expiresAt: monthExpiry(now) } },
      { upsert: true }
    )
  try {
    try {
      await add()
    } catch (error) {
      // Two calls creating the month's total at once: the loser retries as a plain update.
      if ((error as { code?: number }).code !== 11000) throw error
      await add()
    }
  } catch (error) {
    console.error("Failed to record spending:", error instanceof Error ? error.message : error)
  }
}

let warnedUnknownModel = false

/** For route handlers: the 503 response to return when the month's budget is used up, or null to carry on. */
export async function spendingLimitResponse(model: string): Promise<Response | null> {
  const limit = limitUsd()
  if (limit === null) return null
  if (!isKnownModel(model) && !warnedUnknownModel) {
    warnedUnknownModel = true
    console.warn(`No price list for ${model}; the spending limit counts it at the highest known rate.`)
  }
  if (!isOverLimit(await spentThisMonth(), limit)) return null
  console.error(`Monthly spending limit of $${limit} reached; AI requests are paused until next month.`)
  return Response.json(
    { error: "The assistant has used up its budget for this month. Please come back next month." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  )
}
