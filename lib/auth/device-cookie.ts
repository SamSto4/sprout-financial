// Device cookies: how a login tells the owner's own browsers apart from everyone else's.
// Pure, so it can be unit-tested with `node --test`; read and set in lib/auth/device-server.ts.
//
// The per-account login limit (loginAccount) can be used up by anyone who knows an address, which
// would lock the owner out too. So a browser that has logged in to an account, or reset its
// password, gets a signed cookie for it, and its logins are counted per device (loginDevice)
// instead. Someone else's guesses can then pause logins only from browsers the account hasn't been
// used in, and a password reset restores access from the browser it was done in. A token from
// before the account's sessions last ended (a reset, Sign out everywhere) no longer counts, so
// tokens an intruder kept can't go on guessing outside the per-account limit. This follows
// OWASP's "device cookies" defense against online guessing.
//
// A token is "d1.<random id>.<issued, seconds>.<HMAC>". The HMAC (keyed with AUTH_SECRET) covers
// the email, so the cookie names no account and only works for the one it was issued for. It is
// not a session and gives no access on its own: it only changes which counter a login uses.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/** How long a browser stays known after its last login. */
export const DEVICE_COOKIE_DAYS = 180
/** Accounts remembered per browser (a shared family computer), newest first. */
export const MAX_DEVICE_TOKENS = 4
/** A token issued a little "in the future" by a server whose clock runs ahead is still accepted. */
const CLOCK_SKEW_SECONDS = 300

const VERSION = "d1"
const TOKEN_PATTERN = /^d1\.([A-Za-z0-9_-]{22})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/
/** Longest cookie value read: four tokens of 85 characters and their separators. */
const MAX_COOKIE_LENGTH = 400

/** "__Host-" makes the browser refuse the cookie unless it's Secure, host-only and for the whole site. */
export function deviceCookieName(secure: boolean): string {
  return secure ? "__Host-sprout-device" : "sprout-device"
}

function sign(email: string, id: string, issued: number, secret: string): string {
  return createHmac("sha256", `sprout-device:${secret}`)
    .update(`${VERSION}\n${email.trim().toLowerCase()}\n${id}\n${issued}`)
    .digest("base64url")
}

/** A new token for this browser and email. */
export function createDeviceToken(email: string, now: number, secret: string, id: string = randomBytes(16).toString("base64url")): string {
  const issued = Math.floor(now / 1000)
  return `${VERSION}.${id}.${issued}.${sign(email, id, issued, secret)}`
}

/** The id and issue time of `token` when it was issued for this email, is unexpired and its signature matches; otherwise null. */
function readToken(token: string, email: string, now: number, secret: string): { id: string; issued: number } | null {
  const match = TOKEN_PATTERN.exec(token)
  if (!match) return null
  const [, id, issuedText, given] = match
  const issued = Number(issuedText)
  const age = now / 1000 - issued
  if (!Number.isFinite(age) || age < -CLOCK_SKEW_SECONDS || age > DEVICE_COOKIE_DAYS * 86_400) return null
  const expected = Buffer.from(sign(email, id, issued, secret))
  const actual = Buffer.from(given)
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { id, issued } : null
}

function tokensOf(cookie: unknown): string[] {
  if (typeof cookie !== "string" || cookie === "" || cookie.length > MAX_COOKIE_LENGTH) return []
  return cookie.split("~").slice(0, MAX_DEVICE_TOKENS)
}

/** A browser known to an account: its loginDevice counter key, and when its token was issued (seconds). */
export type KnownDevice = { key: string; issuedAt: number }

/**
 * This browser's token for this email, when its cookie holds a valid one; otherwise null (no
 * cookie, another account's, expired, tampered with, or no secret configured). Before counting a
 * login by it, check isDeviceTokenCurrent against when the account's sessions last ended.
 */
export function knownDeviceToken(cookie: unknown, email: string, now: number, secret: string): KnownDevice | null {
  if (!secret) return null
  for (const token of tokensOf(cookie)) {
    const valid = readToken(token, email, now, secret)
    if (valid) return { key: `device-${valid.id}`, issuedAt: valid.issued }
  }
  return null
}

/**
 * Whether a device token still counts its browser apart: only when it was issued after every
 * session for the account last ended (a password reset, Sign out everywhere or the account's
 * deletion; sessionsEndedAt in lib/auth/users.ts). Otherwise each token an intruder collected while
 * logged in would keep its own login allowance after the owner shut them out, and tokens saved on
 * many addresses would add up to more guesses than the per-account limit allows. The browser a
 * reset is done in gets a new token straight after it, in the same second at the latest (tokens
 * keep whole seconds), so a token from that second still counts.
 */
export function isDeviceTokenCurrent(issuedAt: number, sessionsEndedAt: Date | null | undefined): boolean {
  if (!Number.isFinite(issuedAt)) return false
  if (!sessionsEndedAt) return true
  const ended = sessionsEndedAt.getTime()
  if (!Number.isFinite(ended)) return true
  return issuedAt >= Math.floor(ended / 1000)
}

/**
 * The cookie value after a login or reset for this email: a new token first, then the browser's
 * valid tokens for other accounts, at most MAX_DEVICE_TOKENS. Tokens for this email, expired ones
 * and anything unreadable are dropped. Null when there's no secret to sign with.
 */
export function addDeviceToken(cookie: unknown, email: string, now: number, secret: string, id?: string): string | null {
  if (!secret) return null
  const others = tokensOf(cookie).filter((token) => {
    const match = TOKEN_PATTERN.exec(token)
    if (!match) return false
    const age = now / 1000 - Number(match[2])
    if (age < -CLOCK_SKEW_SECONDS || age > DEVICE_COOKIE_DAYS * 86_400) return false
    return readToken(token, email, now, secret) === null
  })
  return [createDeviceToken(email, now, secret, id), ...others].slice(0, MAX_DEVICE_TOKENS).join("~")
}

/** One cookie's value from a Cookie request header, or null. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (typeof header !== "string" || header === "") return null
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}
