import "server-only"

import { MongoServerError } from "mongodb"

import { getDb, isDatabaseConfigured } from "@/lib/db/mongodb"
import {
  checkLimits,
  clientAddress,
  createMemoryStore,
  limitMessage,
  parseDailyTotal,
  policies,
  type CounterStore,
  type Decision,
  type PolicyName,
} from "@/lib/rate-limit/limits"

// Settings (see AGENTS.md section 5.2):
//   RATE_LIMIT               "on" or "off". Unset: on in production, off in development.
//   RATE_LIMIT_DAILY_TOTAL   shared daily cap on AI calls across all visitors (default 400).

function isEnabled() {
  const setting = process.env.RATE_LIMIT?.toLowerCase()
  if (setting === "on") return true
  if (setting === "off") return false
  return process.env.NODE_ENV === "production"
}

type CounterDocument = { _id: string; count: number; expiresAt: Date }

/**
 * Counters in MongoDB, shared by every server instance. Each is one document that MongoDB removes
 * after its window ends (TTL index on expiresAt, created in lib/db/mongodb.ts).
 */
const databaseStore: CounterStore = {
  async increment(key, expiresAt, by = 1) {
    const counters = (await getDb()).collection<CounterDocument>("rate_limits")
    const addOne = () =>
      counters.findOneAndUpdate(
        { _id: key },
        { $inc: { count: by }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: "after" }
      )
    try {
      return (await addOne())?.count ?? 1
    } catch (error) {
      // Two requests creating the same counter at once: the loser retries as a plain update.
      if (error instanceof MongoServerError && error.code === 11000) return (await addOne())?.count ?? 1
      throw error
    }
  },
}

const memoryStore = createMemoryStore()

/** Counts one request against a policy. Never throws: if the database is down, counting falls back to memory. */
export async function checkRateLimit(
  policy: PolicyName,
  headers: { get(name: string): string | null },
  /** How many units this request costs against the policy (default 1). */
  weight = 1
): Promise<Decision> {
  if (!isEnabled()) return { allowed: true }

  const client = clientAddress(headers)
  const limits = policies(parseDailyTotal(process.env.RATE_LIMIT_DAILY_TOTAL))[policy]

  if (isDatabaseConfigured()) {
    try {
      return await checkLimits(databaseStore, client, limits, Date.now(), weight)
    } catch (error) {
      console.error("Rate limit counters unavailable, using in-memory ones:", error instanceof Error ? error.message : error)
    }
  }
  return checkLimits(memoryStore, client, limits, Date.now(), weight)
}

/** For route handlers: the 429 response to return when the request is over a limit, or null to carry on. */
export async function rateLimitResponse(policy: PolicyName, request: Request, weight = 1): Promise<Response | null> {
  const decision = await checkRateLimit(policy, request.headers, weight)
  if (decision.allowed) return null
  return Response.json(
    { error: limitMessage(decision) },
    { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds), "Cache-Control": "no-store" } }
  )
}

export { limitMessage }
