// Request limits for the endpoints that cost money (the AI calls) or guard accounts (log in).
// This file is the logic only: which limits apply, how a fixed-window counter decides, and how
// to tell clients apart. Where the counters live is in server.ts.
// Kept free of framework imports so it can be unit-tested with `node --test`.

/** One limit: at most `max` requests per window, counted per client or across everyone. */
export type Limit = {
  /** Part of the counter's key, so different limits never share a counter. */
  name: string
  /** "client" counts each visitor separately; "everyone" is one shared counter. */
  scope: "client" | "everyone"
  max: number
  windowSeconds: number
}

const MINUTE = 60
const DAY = 24 * 60 * 60

/** The shared daily cap on AI calls when RATE_LIMIT_DAILY_TOTAL isn't set. */
export const DEFAULT_DAILY_TOTAL = 400

/**
 * The limits for each protected action, checked in order. Per-client limits come first, so one
 * visitor being turned away never uses up the shared daily total.
 */
export function policies(dailyTotal: number = DEFAULT_DAILY_TOTAL) {
  // The backstop: however many visitors there are, AI spend per day has a ceiling.
  const total: Limit = { name: "ai-total", scope: "everyone", max: dailyTotal, windowSeconds: DAY }
  const chat: Limit[] = [
    { name: "chat-burst", scope: "client", max: 12, windowSeconds: 10 * MINUTE },
    { name: "chat-day", scope: "client", max: 60, windowSeconds: DAY },
    total,
  ]
  return {
    chat,
    // Deep research runs many more model rounds per question, so it gets its own small allowance.
    deepResearch: [{ name: "research-day", scope: "client", max: 3, windowSeconds: DAY } as Limit, ...chat],
    insights: [
      { name: "insights-burst", scope: "client", max: 5, windowSeconds: 10 * MINUTE },
      { name: "insights-day", scope: "client", max: 20, windowSeconds: DAY },
      total,
    ] as Limit[],
    // Slows password guessing. Counts every attempt, successful or not.
    login: [{ name: "login-burst", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
  }
}

export type PolicyName = keyof ReturnType<typeof policies>

/** Where counters are kept. `increment` adds one and returns the new count for that key. */
export type CounterStore = {
  increment(key: string, expiresAt: Date): Promise<number>
}

export type Decision = { allowed: true } | { allowed: false; scope: Limit["scope"]; retryAfterSeconds: number }

/**
 * Counts this request against each limit and stops at the first one that's exceeded.
 * Windows are fixed: a 10-minute window runs from :00 to :10, :10 to :20, and so on.
 */
export async function checkLimits(
  store: CounterStore,
  client: string,
  limits: readonly Limit[],
  now: number = Date.now()
): Promise<Decision> {
  for (const limit of limits) {
    const windowMs = limit.windowSeconds * 1000
    const windowStart = Math.floor(now / windowMs) * windowMs
    const resetsAt = windowStart + windowMs
    const subject = limit.scope === "client" ? client : "everyone"

    const count = await store.increment(`${limit.name}:${subject}:${windowStart}`, new Date(resetsAt))
    if (count > limit.max) {
      return { allowed: false, scope: limit.scope, retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now) / 1000)) }
    }
  }
  return { allowed: true }
}

const MAX_MEMORY_KEYS = 5000

/**
 * Counters held in this server process. Good for local development and as a fallback; on a
 * serverless host each instance has its own copy, so the database store is the real limit there.
 */
export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const counters = new Map<string, { count: number; expiresAt: number }>()
  return {
    async increment(key, expiresAt) {
      const time = now()
      if (counters.size >= MAX_MEMORY_KEYS) {
        for (const [existing, counter] of counters) {
          if (counter.expiresAt <= time) counters.delete(existing)
        }
        // Still full of live counters: start over rather than grow without bound.
        if (counters.size >= MAX_MEMORY_KEYS) counters.clear()
      }
      const current = counters.get(key)
      const counter = current && current.expiresAt > time ? current : { count: 0, expiresAt: expiresAt.getTime() }
      counter.count += 1
      counters.set(key, counter)
      return counter.count
    },
  }
}

const ADDRESS_PATTERN = /^[0-9a-fA-F:.]{3,45}$/

/**
 * The visitor's IP address, used only as a counter key. Vercel sets these headers itself and
 * overwrites anything the visitor sends; behind another proxy they are only as trustworthy as
 * that proxy. Visitors with no usable address share one "unknown" counter.
 */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const candidates = [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]]
  for (const candidate of candidates) {
    const address = candidate?.trim()
    if (address && ADDRESS_PATTERN.test(address)) return address.toLowerCase()
  }
  return "unknown"
}

/** What to tell someone who hit a limit. */
export function limitMessage(decision: Extract<Decision, { allowed: false }>): string {
  const minutes = Math.ceil(decision.retryAfterSeconds / 60)
  const wait = minutes < 90 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : `${Math.ceil(minutes / 60)} hours`
  return decision.scope === "everyone"
    ? `The assistant has reached its daily limit. Please try again in about ${wait}.`
    : `You've reached the limit for now. Please try again in about ${wait}.`
}

/** Reads the RATE_LIMIT_DAILY_TOTAL setting, falling back to the default when it isn't a positive whole number. */
export function parseDailyTotal(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_TOTAL
}
