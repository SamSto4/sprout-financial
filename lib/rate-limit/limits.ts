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
    // exists, so it reveals nothing. It counts browsers this account hasn't been used in before;
    // anyone who knows the address can use it up. A browser that logged in to the account (or reset
    // its password) carries a signed device cookie (lib/auth/device-cookie.ts) and is counted by
    // loginDevice instead, so the owner's own browsers keep working while someone else's guesses
    // pause this one, and a password reset restores access from the browser it was done in.
    loginAccount: [{ name: "login-account", scope: "client", max: 20, windowSeconds: 15 * MINUTE }] as Limit[],
    // Logins from a known device, per device (knownDeviceKey). Still behind the per-IP limit; this
    // stops a copied device cookie from being used to guess from many addresses.
    loginDevice: [{ name: "login-device", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // Two-step codes typed at login. Only reached once the password was right, so only someone who
    // has the current password can use it up. Keyed by twoFactorLoginKey (account and password
    // version): a password reset gives the owner a fresh count and takes it away from whoever had
    // the old password. 20 a day with ~3 valid codes in a million is about a 0.006% chance a day
    // (the login limits alone allowed ~1,900 tries a day). Recovery codes are counted here too.
    twoFactorLogin: [
      { name: "two-factor-login-burst", scope: "client", max: 5, windowSeconds: 15 * MINUTE },
      { name: "two-factor-login-day", scope: "client", max: 20, windowSeconds: DAY },
    ] as Limit[],
    // The owner is emailed the first time a day that twoFactorLogin refuses a code (someone has the
    // password). Per account by accountKey(email); securityNotice applies as well.
    twoFactorLoginNotice: [{ name: "two-factor-login-notice", scope: "client", max: 1, windowSeconds: DAY }] as Limit[],
    // "Sign out everywhere" on the Account page, per account by accountKey(email). It needs a
    // session; this only stops a loop from filling the security log.
    sessionRevoke: [{ name: "session-revoke-account", scope: "client", max: 5, windowSeconds: 60 * MINUTE }] as Limit[],
    // Slows mass account creation and probing which emails are registered.
    signup: [{ name: "signup-hour", scope: "client", max: 5, windowSeconds: 60 * MINUTE }] as Limit[],
    // Reset requests per visitor, checked before the reply. Each one can send an email, so keep
    // them rare: it stops the form being used to spam inboxes.
    passwordResetRequest: [{ name: "reset-request-hour", scope: "client", max: 5, windowSeconds: 60 * MINUTE }] as Limit[],
    // Per address, so someone rotating IP addresses can't flood one inbox. Counted by
    // accountKey(email) whether or not the account exists, inside after(); over the limit, the
    // form still says "sent" and no email goes out.
    passwordResetAddress: [{ name: "reset-request-address", scope: "client", max: 3, windowSeconds: 60 * MINUTE }] as Limit[],
    // Reset emails across everyone, a ceiling on the email bill. Counted only when an email is
    // about to go to an existing account (startPasswordReset's allowEmail), after the per-address
    // limit, so requests for made-up or repeated addresses can't use it up and block resets for
    // everyone. Reaching it is logged as "limited-total".
    passwordResetTotal: [{ name: "reset-request-total", scope: "everyone", max: 200, windowSeconds: DAY }] as Limit[],
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
    // Turning two-step verification on (each try checks the current password) or off, making new
    // recovery codes, and deleting an account that has it on: each try checks a password or a code,
    // so it's counted per account by accountKey(email). Codes typed at login are counted by
    // twoFactorLogin instead.
    twoFactor: [{ name: "two-factor-account", scope: "client", max: 10, windowSeconds: 15 * MINUTE }] as Limit[],
    // Emails telling an account's owner about a security change (two-step verification turned off,
    // password changed, a recovery code used to log in), per account by accountKey(email). Each
    // one needs a session, a reset link, or the password and a code, so this only stops a loop from
    // flooding the owner's inbox. Over the limit the change still happens and is still in the
    // security log; only the email is skipped.
    securityNotice: [{ name: "security-notice-account", scope: "client", max: 10, windowSeconds: 60 * MINUTE }] as Limit[],
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

/**
 * The twoFactorLogin counter's key: the account and the time its password last changed (0 for
 * never). After a reset the count starts over, for the owner only: the old password stops working
 * at the same moment.
 */
export function twoFactorLoginKey(
  email: string,
  passwordChangedAt: Date | null | undefined,
  secret: string = process.env.AUTH_SECRET ?? ""
): string {
  const version = passwordChangedAt instanceof Date && Number.isFinite(passwordChangedAt.getTime()) ? passwordChangedAt.getTime() : 0
  return `${accountKey(email, secret)}:pw${version}`
}

const ADDRESS_PATTERN = /^[0-9a-fA-F:.]{3,45}$/
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/

/** The eight 16-bit groups of an IPv6 address (any :: shorthand, optional dotted IPv4 tail), or null. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase()
  const lastColon = text.lastIndexOf(":")
  const tail = text.slice(lastColon + 1)
  if (tail.includes(".")) {
    // "::ffff:203.0.113.7": the last 32 bits written as IPv4. Rewrite them as two groups.
    const octets = IPV4_PATTERN.exec(tail)?.slice(1).map(Number)
    if (!octets || octets.some((octet) => octet > 255)) return null
    text = `${text.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = text.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  // "::" stands for at least one zero group; without it there must be exactly eight.
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest]
  if (!groups.every((group) => HEXTET_PATTERN.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

/**
 * The part of an address that identifies one visitor. IPv4 stays as it is. An IPv6 address is cut
 * to its /64 network, because one customer is normally given at least a /64 (2^64 addresses) and
 * could send every request from a new one; an IPv4 address written as IPv6 (::ffff:a.b.c.d) counts
 * as that IPv4 address. Null when an address with a colon isn't valid IPv6.
 */
export function normalizeAddress(address: string): string | null {
  const text = address.trim().toLowerCase()
  if (!text.includes(":")) return text
  const groups = ipv6Groups(text)
  if (!groups) return null
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".")
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`
}

/**
 * The visitor's address (IPv6 cut to its /64, see normalizeAddress). Vercel sets these headers
 * itself and overwrites anything the visitor sends; behind another proxy they are only as
 * trustworthy as that proxy. Visitors with no usable address share one "unknown" counter. Counters
 * never store it as it is: they use visitorKey().
 */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const candidates = [headers.get("x-real-ip"), headers.get("x-forwarded-for")?.split(",")[0]]
  for (const candidate of candidates) {
    const address = candidate?.trim()
    const normalized = address && ADDRESS_PATTERN.test(address) ? normalizeAddress(address) : null
    if (normalized) return normalized
  }
  return "unknown"
}

/**
 * A counter key for an IP address that never reveals it, like accountKey: an HMAC keyed with
 * AUTH_SECRET, so a copy of the rate_limits collection doesn't list who used the site, and guesses
 * (all of IPv4 is only 2^32) can't be checked against it without the secret. Without AUTH_SECRET
 * (local development) the key is still stable, so counting works the same. "unknown" stays as it is.
 */
export function addressKey(address: string, secret: string = process.env.AUTH_SECRET ?? ""): string {
  if (address === "unknown") return address
  return `ip-${createHmac("sha256", `sprout-ip-key:${secret}`).update(address).digest("hex").slice(0, 32)}`
}

/** The per-visitor counter key for a request: its address, grouped and hashed. */
export function visitorKey(headers: { get(name: string): string | null }, secret?: string): string {
  return addressKey(clientAddress(headers), secret)
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
