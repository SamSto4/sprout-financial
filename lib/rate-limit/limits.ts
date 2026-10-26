// Request limits for the endpoints that cost money (the AI calls) or guard accounts (log in).
// This file is the logic only: which limits apply, how a fixed-window counter decides, and how
// to tell clients apart. Where the counters live is in server.ts.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { createHmac } from "node:crypto"

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
    // Screenshot import: one model call per image, and a person adds a handful at a time.
    screenshot: [
      { name: "screenshot-burst", scope: "client", max: 12, windowSeconds: 10 * MINUTE },
      { name: "screenshot-day", scope: "client", max: 40, windowSeconds: DAY },
      total,
    ] as Limit[],
    // Slows password guessing. Counts every attempt, successful or not. Checked inside the
    // credentials provider (lib/auth/auth.ts), so it covers Auth.js's own endpoint as well as the form.
    login: [{ name: "login-burst", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // The same, per account: an attacker rotating IP addresses (a botnet, credential stuffing) never
    // trips the per-visitor limit above. Counted by accountKey(email), whether or not the account
    // exists, so it reveals nothing. Trade-off: someone can keep one account's logins paused for
    // 15 minutes at a time; the owner can still reset the password.
    loginAccount: [{ name: "login-account", scope: "client", max: 20, windowSeconds: 15 * MINUTE }] as Limit[],
    // Slows mass account creation and probing which emails are registered.
    signup: [{ name: "signup-hour", scope: "client", max: 5, windowSeconds: 60 * MINUTE }] as Limit[],
    // Each request can send an email, so keep them rare: it stops the form being used to spam inboxes.
    passwordResetRequest: [
      { name: "reset-request-hour", scope: "client", max: 5, windowSeconds: 60 * MINUTE },
      { name: "reset-request-total", scope: "everyone", max: 200, windowSeconds: DAY },
    ] as Limit[],
    // Per address, so someone rotating IP addresses can't flood one inbox, or use up the shared
    // daily total above and block resets for everyone. Counted by accountKey(email) whether or not
    // the account exists; over the limit, the form still says "sent" and no email goes out.
    passwordResetAddress: [{ name: "reset-request-address", scope: "client", max: 3, windowSeconds: 60 * MINUTE }] as Limit[],
    // Slows guessing reset links (they're 256-bit random, so this is belt and braces).
    passwordResetSubmit: [{ name: "reset-submit-burst", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // Sign-up confirmation emails (and "you already have an account" notices), per address by
    // accountKey(email), so nobody can flood one inbox, plus a ceiling across everyone so a flood
    // of sign-ups can't run up the email bill. Sign-ups are also limited per IP (signup, above).
    // Reaching the ceiling is logged as "limited-total"; if it ever shows up in real traffic, add a
    // CAPTCHA to sign-up rather than raising it.
    // Checked first, per address and sender IP: a repeat from one place uses only its own share.
    verifyEmailSendFrom: [{ name: "verify-email-from", scope: "client", max: 3, windowSeconds: 60 * MINUTE }] as Limit[],
    verifyEmailSend: [
      { name: "verify-email-address", scope: "client", max: 10, windowSeconds: 60 * MINUTE },
      { name: "verify-email-total", scope: "everyone", max: 1000, windowSeconds: DAY },
    ] as Limit[],
    // Confirming a sign-up, per visitor: each try is a bcrypt check of the sign-up password.
    verifyEmailSubmit: [{ name: "verify-submit-burst", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // Syncing a signed-in account (saves and deletes under /api/account). Counted per account by
    // accountKey(email). A browser uploads a change about a second after it happens and a new
    // device uploads at most ~55 items, so real use stays far below this; it stops one account
    // (or a stolen session) from hammering the database.
    accountSync: [
      { name: "sync-burst", scope: "client", max: 300, windowSeconds: 10 * MINUTE },
      { name: "sync-day", scope: "client", max: 5000, windowSeconds: DAY },
    ] as Limit[],
    // Loading everything synced (GET /api/account), which happens once per full page load. It's
    // the heaviest read (up to 50 chats), so it gets its own, smaller allowance.
    accountLoad: [{ name: "sync-load", scope: "client", max: 60, windowSeconds: 10 * MINUTE }] as Limit[],
    // Turning two-step verification on or off, or making new recovery codes: each try checks a
    // code, so it's counted per account by accountKey(email). Codes typed at login are counted by
    // login and loginAccount instead, with the password they come with.
    twoFactor: [{ name: "two-factor-account", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // Live price lookups for the portfolio page. Cheap, but they use the market data plan's quota.
    // Counted per symbol (a 15-symbol refresh costs 15), since each symbol is its own lookups.
    marketData: [
      { name: "market-burst", scope: "client", max: 30, windowSeconds: 10 * MINUTE },
      { name: "market-total", scope: "everyone", max: 2000, windowSeconds: DAY },
    ] as Limit[],
  }
}

export type PolicyName = keyof ReturnType<typeof policies>

/** Where counters are kept. `increment` adds `by` (default 1) and returns the new count for that key. */
export type CounterStore = {
  increment(key: string, expiresAt: Date, by?: number): Promise<number>
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
  now: number = Date.now(),
  /** How many units this request costs, e.g. one per symbol looked up. */
  weight = 1
): Promise<Decision> {
  const by = Math.max(1, Math.floor(Number.isFinite(weight) ? weight : 1))
  for (const limit of limits) {
    const windowMs = limit.windowSeconds * 1000
    const windowStart = Math.floor(now / windowMs) * windowMs
    const resetsAt = windowStart + windowMs
    const subject = limit.scope === "client" ? client : "everyone"

    const count = await store.increment(`${limit.name}:${subject}:${windowStart}`, new Date(resetsAt), by)
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
    async increment(key, expiresAt, by = 1) {
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
      counter.count += by
      counters.set(key, counter)
      return counter.count
    },
  }
}

/**
 * A key for an email that never reveals it: rate-limit counters and deletion records use it, and
 * "Me@X.com " counts the same as "me@x.com". It's an HMAC keyed with the site's AUTH_SECRET, so
 * someone who can read the database can't hash a guessed address and look for it (a plain hash
 * of an email is easy to check guesses against).
 */
export function accountKey(email: string, secret: string = process.env.AUTH_SECRET ?? ""): string {
  return `account-${createHmac("sha256", `sprout-account-key:${secret}`).update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`
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
