// The security activity log: which events are kept, what context goes with them, and how they're
// shown on the Account page. Pure, so it can be unit-tested with `node --test`; the MongoDB wiring,
// the after-the-response scheduling and the notice emails are in security-log-server.ts.
//
// Privacy: each event keeps its type, time, how the person logged in, a browser and system name
// from a fixed list (never the raw user agent) and, on Vercel, the city and country Vercel works
// out from the connection. Never an IP address, password, code, token or secret. Rows expire
// after SECURITY_LOG_RETENTION_DAYS and are deleted with the account.

import { countryName, formatDateTimeUtc, formatTimeAgo } from "../format.ts"

/** How long an event is kept (TTL on expiresAt, lib/db/mongodb.ts). */
export const SECURITY_LOG_RETENTION_DAYS = 90
/**
 * Kept per account and per type, newest first. Per type, so a flood of one kind (wrong passwords,
 * reset requests, or logins by someone who has the password) can't push out the others, such as
 * two-step verification being turned off. At most 30 x 11 types = 330 small rows per account.
 */
export const MAX_EVENTS_PER_TYPE = 30
/** Rows the Account page can show (after grouping repeats). */
export const MAX_ROWS = 50
/** A "password right, no code" prompt is hidden when the same device got further within this time. */
export const PROMPT_FOLLOW_UP_MINUTES = 10
/** Repeated failed attempts from the same device and place this close together show as one row. */
export const REPEAT_WINDOW_MINUTES = 60

export const SECURITY_EVENT_TYPES = [
  "sign_in",
  "account_created",
  "password_wrong",
  "two_step_prompted",
  "two_step_failed",
  "two_step_on",
  "two_step_off",
  "recovery_codes_replaced",
  "password_reset_requested",
  "password_changed",
  "signed_out_everywhere",
] as const
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number]

/** The most rows read for the Account page: every event an account can hold. */
export const SECURITY_LOG_READ_LIMIT = MAX_EVENTS_PER_TYPE * SECURITY_EVENT_TYPES.length

/** Things anyone can set off against an account (they need no session). Shown as attempts, and grouped when repeated. */
const ATTEMPT_TYPES: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>([
  "password_wrong",
  "two_step_prompted",
  "two_step_failed",
  "password_reset_requested",
])

export type SecurityEventGroup = "activity" | "attempt"

export function eventGroup(type: SecurityEventType): SecurityEventGroup {
  return ATTEMPT_TYPES.has(type) ? "attempt" : "activity"
}

export const BROWSERS = ["Edge", "Opera", "Samsung Internet", "Firefox", "Chrome", "Safari"] as const
export type Browser = (typeof BROWSERS)[number]
export const SYSTEMS = ["iPhone", "iPad", "Android", "Windows", "ChromeOS", "macOS", "Linux"] as const
export type OperatingSystem = (typeof SYSTEMS)[number]

export type SignInMethod = "password" | "google"
export type SecondFactorKind = "app" | "recovery"

/** What's kept about where a request came from. Every field is optional. */
export type RequestContext = { browser?: Browser; os?: OperatingSystem; city?: string; country?: string }

export type SecurityEvent = RequestContext & {
  type: SecurityEventType
  at: Date
  /** sign_in and account_created only. */
  method?: SignInMethod
  /** sign_in, two_step_off and recovery_codes_replaced only: which kind of code was used. */
  secondFactor?: SecondFactorKind
}

export type SecurityEventDoc = SecurityEvent & { userEmail: string; expiresAt: Date }

type HeaderReader = { get(name: string): string | null }

const MAX_USER_AGENT = 512

/**
 * A browser and system name from the user agent, from fixed lists so nothing the visitor typed is
 * stored. Plain substring checks (no regular expressions), on at most 512 characters. Order matters:
 * iPhone user agents also say "Mac OS X", Android ones say "Linux", Edge and Opera ones say "Chrome".
 * iPads asking for desktop sites (Safari's default) report a Mac and show as macOS.
 */
export function parseUserAgent(userAgent: string | null | undefined): { browser?: Browser; os?: OperatingSystem } {
  if (typeof userAgent !== "string" || userAgent === "") return {}
  const ua = userAgent.slice(0, MAX_USER_AGENT)
  const has = (part: string) => ua.includes(part)

  let os: OperatingSystem | undefined
  if (has("iPhone") || has("iPod")) os = "iPhone"
  else if (has("iPad")) os = "iPad"
  else if (has("Android")) os = "Android"
  else if (has("Windows")) os = "Windows"
  else if (has("CrOS")) os = "ChromeOS"
  else if (has("Macintosh") || has("Mac OS X")) os = "macOS"
  else if (has("Linux")) os = "Linux"

  let browser: Browser | undefined
  if (has("Edg/") || has("EdgA/") || has("EdgiOS/")) browser = "Edge"
  else if (has("OPR/") || has("OPiOS/")) browser = "Opera"
  else if (has("SamsungBrowser/")) browser = "Samsung Internet"
  else if (has("Firefox/") || has("FxiOS/")) browser = "Firefox"
  else if (has("Chrome/") || has("CriOS/")) browser = "Chrome"
  else if (has("Safari/") && has("Version/")) browser = "Safari"

  return { ...(browser ? { browser } : {}), ...(os ? { os } : {}) }
}

// Letters (any language), spaces and the punctuation real place names use. No digits, no markup.
const CITY_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’()-]{0,59}$/u

/** Vercel's x-vercel-ip-city, which is percent-encoded. Undefined unless it reads as a place name. */
export function cleanCity(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string" || raw === "" || raw.length > 200) return undefined
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return undefined
  }
  const city = decoded.normalize("NFC").trim()
  return CITY_PATTERN.test(city) ? city : undefined
}

/** Vercel's x-vercel-ip-country: an ISO 3166-1 two-letter code. */
export function cleanCountry(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined
  const code = raw.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : undefined
}

/**
 * Location headers are trusted only where the host sets them: on Vercel (VERCEL=1), and in local
 * development so the feature can be tried by sending the headers by hand. Anywhere else a visitor
 * could send their own and make the log show a place of their choosing.
 */
export function trustLocationHeaders(env: Record<string, string | undefined>): boolean {
  return env.VERCEL === "1" || env.NODE_ENV === "development"
}

export function readRequestContext(headers: HeaderReader, options: { trustLocation: boolean }): RequestContext {
  const context: RequestContext = parseUserAgent(headers.get("user-agent"))
  if (options.trustLocation) {
    const country = cleanCountry(headers.get("x-vercel-ip-country"))
    const city = cleanCity(headers.get("x-vercel-ip-city"))
    if (country) context.country = country
    if (city) context.city = city
  }
  return context
}

export function securityLogExpiry(at: Date): Date {
  return new Date(at.getTime() + SECURITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

const METHOD_TYPES: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>(["sign_in", "account_created"])
const SECOND_FACTOR_TYPES: ReadonlySet<SecurityEventType> = new Set<SecurityEventType>(["sign_in", "two_step_off", "recovery_codes_replaced"])

const isBrowser = (value: unknown): value is Browser => (BROWSERS as readonly unknown[]).includes(value)
const isSystem = (value: unknown): value is OperatingSystem => (SYSTEMS as readonly unknown[]).includes(value)
const isType = (value: unknown): value is SecurityEventType => (SECURITY_EVENT_TYPES as readonly unknown[]).includes(value)

/**
 * Checks an event field by field and keeps only what its type allows, so nothing else can reach the
 * database or the page. Fields that are missing are left out rather than stored as null.
 */
function cleanEvent(raw: Record<string, unknown>): SecurityEvent | null {
  const { type, at } = raw
  if (!isType(type) || !(at instanceof Date) || !Number.isFinite(at.getTime())) return null
  const event: SecurityEvent = { type, at }
  if (METHOD_TYPES.has(type) && (raw.method === "password" || raw.method === "google")) event.method = raw.method
  if (SECOND_FACTOR_TYPES.has(type) && (raw.secondFactor === "app" || raw.secondFactor === "recovery")) event.secondFactor = raw.secondFactor
  if (isBrowser(raw.browser)) event.browser = raw.browser
  if (isSystem(raw.os)) event.os = raw.os
  const country = cleanCountry(typeof raw.country === "string" ? raw.country : undefined)
  if (country) event.country = country
  // Stored cities are already decoded; a "%" can't pass CITY_PATTERN, so decoding again is harmless.
  const city = cleanCity(typeof raw.city === "string" ? raw.city : undefined)
  if (city) event.city = city
  return event
}

/** The document to insert. Null when the event isn't valid (never written). */
export function buildEventDoc(email: string, event: SecurityEvent): SecurityEventDoc | null {
  const userEmail = email.trim().toLowerCase()
  const clean = cleanEvent(event as unknown as Record<string, unknown>)
  if (!clean || userEmail === "") return null
  return { ...clean, userEmail, expiresAt: securityLogExpiry(clean.at) }
}

/** A stored row, checked again on the way out (the page never trusts what's in the database). */
export function parseStoredEvent(raw: unknown): SecurityEvent | null {
  if (!raw || typeof raw !== "object") return null
  return cleanEvent(raw as Record<string, unknown>)
}

export function deviceLabel(context: Pick<RequestContext, "browser" | "os">): string {
  if (context.browser && context.os) return `${context.browser} on ${context.os}`
  if (context.browser) return context.browser
  if (context.os) return `Unknown browser on ${context.os}`
  return "Unknown device"
}

export function locationLabel(context: Pick<RequestContext, "city" | "country">): string | null {
  const country = context.country ? countryName(context.country) : null
  if (context.city && country) return `${context.city}, ${country}`
  return country ?? context.city ?? null
}

function eventTitle(event: SecurityEvent): string {
  switch (event.type) {
    case "sign_in":
      if (event.method === "google") return "Logged in with Google"
      if (event.secondFactor === "recovery") return "Logged in with your password and a recovery code"
      if (event.secondFactor === "app") return "Logged in with your password and a code from your app"
      return "Logged in with your password"
    case "account_created":
      return event.method === "google" ? "Account created with Google" : "Account created"
    case "password_wrong":
      return "Wrong password entered"
    case "two_step_prompted":
      return "Correct password entered, but no two-step code"
    case "two_step_failed":
      return "Correct password entered, but a wrong two-step code"
    case "two_step_on":
      return "Two-step verification turned on"
    case "two_step_off":
      return event.secondFactor === "recovery" ? "Two-step verification turned off using a recovery code" : "Two-step verification turned off"
    case "recovery_codes_replaced":
      return event.secondFactor === "recovery" ? "New recovery codes made using a recovery code" : "New recovery codes made"
    case "password_reset_requested":
      return "Password reset email sent"
    case "password_changed":
      return "Password changed with a reset link"
    case "signed_out_everywhere":
      return "Signed out everywhere"
  }
}

export type SecurityLogTone = "normal" | "attempt" | "warning"

/** What the Account page gets: the rows, or "unavailable" when the database couldn't be read. */
export type SecurityActivity = { status: "ok"; rows: SecurityLogRow[] } | { status: "unavailable" }

export type SecurityLogRow = {
  /** Stable within one render, for React keys. */
  key: string
  type: SecurityEventType
  tone: SecurityLogTone
  title: string
  /** "Chrome on Windows · Berlin, Germany". */
  detail: string
  /** ISO time of the newest event in the row, for <time dateTime>. */
  at: string
  /** "3 hours ago". */
  when: string
  /** "Oct 27, 2026, 2:05 PM UTC", for the tooltip. */
  exact: string
  /** More than 1 when repeated attempts were grouped into this row. */
  count: number
}

const sameDevice = (a: RequestContext, b: RequestContext) => a.browser === b.browser && a.os === b.os
const samePlace = (a: RequestContext, b: RequestContext) => a.city === b.city && a.country === b.country

/**
 * The rows for the Account page, newest first:
 * 1. A "correct password, no code" prompt is dropped when the same device signed in or tried a code
 *    within PROMPT_FOLLOW_UP_MINUTES: that's the normal two-step login, not something to look at.
 * 2. Repeated failed attempts (same type, device and place, each within REPEAT_WINDOW_MINUTES of
 *    the next) become one row with a count, so a burst of guesses doesn't fill the list.
 */
export function summarizeEvents(events: readonly SecurityEvent[], now: number, limit: number = MAX_ROWS): SecurityLogRow[] {
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime())
  const followUpMs = PROMPT_FOLLOW_UP_MINUTES * 60_000
  const visible = sorted.filter((event, index) => {
    if (event.type !== "two_step_prompted") return true
    // Newer events come first, so anything that followed this prompt is earlier in the list.
    return !sorted.slice(0, index).some(
      (later) =>
        (later.type === "sign_in" || later.type === "two_step_failed") &&
        later.at.getTime() - event.at.getTime() <= followUpMs &&
        sameDevice(later, event)
    )
  })

  const repeatMs = REPEAT_WINDOW_MINUTES * 60_000
  const groups: { newest: SecurityEvent; oldest: SecurityEvent; count: number }[] = []
  for (const event of visible) {
    const last = groups[groups.length - 1]
    if (
      last &&
      eventGroup(event.type) === "attempt" &&
      last.newest.type === event.type &&
      sameDevice(last.oldest, event) &&
      samePlace(last.oldest, event) &&
      last.oldest.at.getTime() - event.at.getTime() <= repeatMs
    ) {
      last.oldest = event
      last.count += 1
    } else {
      groups.push({ newest: event, oldest: event, count: 1 })
    }
  }

  return groups.slice(0, limit).map(({ newest, count }, index) => {
    const title = eventTitle(newest)
    const place = locationLabel(newest)
    return {
      key: `${newest.type}-${newest.at.getTime()}-${index}`,
      type: newest.type,
      tone: eventGroup(newest.type) === "attempt" ? "attempt" : newest.type === "two_step_off" ? "warning" : "normal",
      title: count > 1 ? `${title} (${count} times)` : title,
      detail: place ? `${deviceLabel(newest)} · ${place}` : deviceLabel(newest),
      at: newest.at.toISOString(),
      when: formatTimeAgo(newest.at, now),
      exact: formatDateTimeUtc(newest.at),
      count,
    }
  })
}
