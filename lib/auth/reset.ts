// Password reset: the rules, with storage and email passed in so they can be unit-tested with
// `node --test`. The server wiring (MongoDB, Resend) is in reset-server.ts.
//
// How it works:
// 1. Someone asks for a reset. If the email has a password account, a random token is created,
//    only its SHA-256 hash is stored (with a 1-hour expiry), and a link with the token is emailed.
//    Whatever happens, the page says the same thing, so it can't be used to find out who has an account.
// 2. The link opens /reset-password/open?token=..., which moves the token into a cookie and shows
//    /reset-password (lib/auth/token-link.ts). The new password is checked like a sign-up password.
//    The token is taken (found and deleted in one step), so it works once, and every other
//    outstanding token for that email is deleted too.

import { createHash, randomBytes } from "node:crypto"

import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, passwordBytes } from "./validate.ts"

export const RESET_TOKEN_TTL_MINUTES = 60
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** 32 random bytes, URL-safe. */
export function newResetToken(): string {
  return randomBytes(32).toString("base64url")
}

/** What's stored: a database leak doesn't hand out working reset links. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function isResetTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value)
}

// The site's address for links in emails. It moved to lib/site-url.ts, which page metadata shares;
// re-exported so existing imports keep working.
export { siteUrl } from "../site-url.ts"

/**
 * Whether password reset works on this server: it needs the database and, in production, a way to
 * email the link (RESEND_API_KEY). In development the link is printed to the terminal instead.
 * Wired up as passwordResetAvailable() in reset-server.ts; copy that sends people to /forgot-password
 * checks it, so nobody is pointed at a page that says reset isn't available.
 */
export function canResetPasswords(settings: { database: boolean; email: boolean; production: boolean }): boolean {
  return settings.database && (settings.email || !settings.production)
}

/** Opens /reset-password/open, which moves the token out of the address bar (lib/auth/token-link.ts). */
export function resetLink(base: string, token: string) {
  return `${base}/reset-password/open?token=${encodeURIComponent(token)}`
}

export type NewPasswordResult = { ok: true; password: string } | { ok: false; error: string }

export function validateNewPassword(password: unknown, confirm: unknown): NewPasswordResult {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (passwordBytes(password) > MAX_PASSWORD_BYTES) {
    return { ok: false, error: `Passwords can be at most ${MAX_PASSWORD_BYTES} characters.` }
  }
  if (password !== confirm) return { ok: false, error: "The two passwords don't match." }
  return { ok: true, password }
}

export type ResetEmail = { to: string; subject: string; text: string; html: string }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

export function resetEmail(to: string, link: string): ResetEmail {
  const text = [
    "Someone (hopefully you) asked to reset the password for your Sprout account.",
    "",
    `Choose a new password here: ${link}`,
    "",
    `The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ].join("\n")
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Someone (hopefully you) asked to reset the password for your Sprout account.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#216B47;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
<p style="color:#60756A;font-size:14px">The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If you didn't ask for this, you can ignore this email. Your password won't change.</p>
</div>`
  return { to, subject: "Reset your Sprout password", text, html }
}

export function googleOnlyEmail(to: string, loginLink: string): ResetEmail {
  const text = [
    "Someone asked to reset the password for your Sprout account.",
    "",
    "Your account signs in with Google, so it doesn't have a Sprout password to reset.",
    `Use "Continue with Google" here: ${loginLink}`,
    "",
    "If you didn't ask for this, you can ignore this email.",
  ].join("\n")
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Someone asked to reset the password for your Sprout account.</p>
<p>Your account signs in with Google, so it doesn't have a Sprout password to reset. Use <strong>Continue with Google</strong> on the <a href="${escapeHtml(loginLink)}">login page</a>.</p>
<p style="color:#60756A;font-size:14px">If you didn't ask for this, you can ignore this email.</p>
</div>`
  return { to, subject: "About your Sprout password", text, html }
}

export type ResetAccount = { email: string; hasPassword: boolean }

/** Storage and email, supplied by the server (or by a test). */
export type ResetDeps = {
  findAccount(email: string): Promise<ResetAccount | null>
  saveToken(record: { tokenHash: string; email: string; expiresAt: Date }): Promise<void>
  /** Finds an unexpired token by hash and deletes it in the same step. Returns its email. */
  takeToken(tokenHash: string, now: Date): Promise<string | null>
  deleteTokensFor(email: string): Promise<void>
  setPassword(email: string, password: string): Promise<void>
  sendEmail(email: ResetEmail): Promise<void>
  /**
   * Counts one reset email against the site-wide daily total; false when it's used up. Asked only
   * when an email is about to go to an existing account, so requests for addresses with no
   * account never use it up. Leave it out to send without a total (tests).
   */
  allowEmail?: () => Promise<boolean>
  newToken?: () => string
  now?: () => Date
}

/** What happened, for logs and tests only. The visitor always sees the same message. */
export type StartOutcome = "sent" | "google-only" | "no-account" | "limited-total"

export async function startPasswordReset(email: string, base: string, deps: ResetDeps): Promise<StartOutcome> {
  const account = await deps.findAccount(email)
  if (!account) return "no-account"
  if (deps.allowEmail && !(await deps.allowEmail())) return "limited-total"
  if (!account.hasPassword) {
    await deps.sendEmail(googleOnlyEmail(account.email, `${base}/login`))
    return "google-only"
  }
  const token = (deps.newToken ?? newResetToken)()
  const now = (deps.now ?? (() => new Date()))()
  await deps.saveToken({
    tokenHash: hashResetToken(token),
    email: account.email,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
  })
  await deps.sendEmail(resetEmail(account.email, resetLink(base, token)))
  return "sent"
}

/**
 * startPasswordReset for the request form: never throws, so a failed lookup or email can't change
 * what the visitor sees (which would reveal whether the address has an account). Failures are
 * returned as "failed" for the log line.
 */
export async function startPasswordResetQuietly(email: string, base: string, deps: ResetDeps): Promise<StartOutcome | "failed"> {
  try {
    return await startPasswordReset(email, base, deps)
  } catch {
    return "failed"
  }
}

export const INVALID_LINK = "This reset link is invalid or has expired. Ask for a new one."

export type FinishResult = { ok: true; email: string } | { ok: false; error: string }

export async function finishPasswordReset(
  token: unknown,
  password: unknown,
  confirm: unknown,
  deps: ResetDeps
): Promise<FinishResult> {
  if (!isResetTokenShape(token)) return { ok: false, error: INVALID_LINK }
  // Check the password first, so a typo doesn't use up the link.
  const checked = validateNewPassword(password, confirm)
  if (!checked.ok) return checked
  const now = (deps.now ?? (() => new Date()))()
  const email = await deps.takeToken(hashResetToken(token), now)
  if (!email) return { ok: false, error: INVALID_LINK }
  await deps.setPassword(email, checked.password)
  await deps.deleteTokensFor(email)
  return { ok: true, email }
}
