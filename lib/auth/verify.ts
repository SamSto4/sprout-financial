// Email verification for password sign-ups: the rules, with storage and email passed in so they can
// be unit-tested with `node --test`. The server wiring (MongoDB, Resend, rate limits) is in
// verify-server.ts.
//
// Why: accounts are keyed by email, and without this anyone could register a stranger's address.
//
// How it works:
// 1. Sign-up always answers "check your email", whether or not the address is taken, so the form
//    can't be used to find out who has an account. A new address gets an unconfirmed account and a
//    confirmation link; a taken one gets an email saying how to log in instead.
// 2. An unconfirmed account can't log in. Logging in to one with the right password sends a new link.
// 3. The link opens /verify-email?token=..., where a button confirms the address. (A button rather
//    than confirming on page load, so email scanners that open links don't act on them.)
// 4. Unconfirmed accounts delete themselves after UNVERIFIED_ACCOUNT_DAYS (TTL index on users).
// 5. Choosing a new password through a reset link also confirms the address (the link went to that
//    inbox), as does Google sign-in (Google confirms it). Google sign-in on an unconfirmed account
//    also removes its password, which may have been set by someone else (lib/auth/users.ts).
//
// Tokens work like reset tokens: 32 random bytes, only the SHA-256 hash stored, one use.

import { hashResetToken, isResetTokenShape, newResetToken } from "./reset.ts"

export const VERIFY_LINK_TTL_HOURS = 24
export const UNVERIFIED_ACCOUNT_DAYS = 7

/**
 * Whether new password accounts must confirm their email. That needs email that reaches anyone: a
 * Resend key and a sender on a verified domain (Resend's test sender only delivers to the Resend
 * account's owner, so nobody else could ever confirm). In development the link is printed to the
 * terminal instead. Without either, sign-up works as before, unconfirmed, and logs a warning.
 */
export function verificationRequired(env: Record<string, string | undefined>): boolean {
  if (env.NODE_ENV !== "production") return true
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM?.trim())
}

export function unverifiedExpiry(now: Date): Date {
  return new Date(now.getTime() + UNVERIFIED_ACCOUNT_DAYS * 24 * 60 * 60_000)
}

export function verifyLink(base: string, token: string) {
  return `${base}/verify-email?token=${encodeURIComponent(token)}`
}

export type VerifyEmail = { to: string; subject: string; text: string; html: string }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

const FOOTER_STYLE = "color:#60756A;font-size:14px"
const BUTTON_STYLE =
  "display:inline-block;background:#216B47;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none"

export function verificationEmail(to: string, link: string): VerifyEmail {
  const text = [
    "Confirm your email to finish creating your Sprout account.",
    "",
    `Confirm here: ${link}`,
    "",
    `The link works once and expires in ${VERIFY_LINK_TTL_HOURS} hours.`,
    `If you didn't sign up for Sprout, ignore this email. The account will be removed in ${UNVERIFIED_ACCOUNT_DAYS} days.`,
  ].join("\n")
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Confirm your email to finish creating your Sprout account.</p>
<p><a href="${escapeHtml(link)}" style="${BUTTON_STYLE}">Confirm my email</a></p>
<p style="${FOOTER_STYLE}">The link works once and expires in ${VERIFY_LINK_TTL_HOURS} hours. If you didn't sign up for Sprout, ignore this email. The account will be removed in ${UNVERIFIED_ACCOUNT_DAYS} days.</p>
</div>`
  return { to, subject: "Confirm your email for Sprout", text, html }
}

/** Sent when someone signs up with an address that already has an account. */
export function existingAccountEmail(to: string, base: string, account: Pick<SignupAccount, "hasPassword" | "verified">): VerifyEmail {
  const login = `${base}/login`
  const forgot = `${base}/forgot-password`
  const what = !account.hasPassword
    ? `Your account signs in with Google. Use "Continue with Google" on the login page: ${login}`
    : account.verified
      ? `Log in here: ${login}\nForgot your password? Choose a new one here: ${forgot}`
      : `It hasn't been confirmed yet. If you created it, log in with the password you chose and we'll send a new confirmation link: ${login}\nDon't know that password? Choosing a new one also confirms the account: ${forgot}`
  const text = [
    "Someone tried to create a Sprout account with this email, but there's already an account for it.",
    "",
    what,
    "",
    "If this wasn't you, you can ignore this email. Nothing has changed.",
  ].join("\n")
  const htmlWhat = !account.hasPassword
    ? `<p>Your account signs in with Google. Use <strong>Continue with Google</strong> on the <a href="${escapeHtml(login)}">login page</a>.</p>`
    : account.verified
      ? `<p><a href="${escapeHtml(login)}" style="${BUTTON_STYLE}">Log in</a></p><p>Forgot your password? <a href="${escapeHtml(forgot)}">Choose a new one</a>.</p>`
      : `<p>It hasn't been confirmed yet. If you created it, <a href="${escapeHtml(login)}">log in</a> with the password you chose and we'll send a new confirmation link. Don't know that password? <a href="${escapeHtml(forgot)}">Choosing a new one</a> also confirms the account.</p>`
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Someone tried to create a Sprout account with this email, but there's already an account for it.</p>
${htmlWhat}
<p style="${FOOTER_STYLE}">If this wasn't you, you can ignore this email. Nothing has changed.</p>
</div>`
  return { to, subject: "You already have a Sprout account", text, html }
}

export type SignupAccount = { email: string; hasPassword: boolean; verified: boolean }

/** Storage, email and the per-address email limit, supplied by the server (or by a test). */
export type VerifyDeps = {
  findAccount(email: string): Promise<SignupAccount | null>
  /** Creates an unconfirmed password account. False if the email is already taken (a race). */
  createAccount(email: string, password: string, unverifiedUntil: Date): Promise<boolean>
  saveToken(record: { tokenHash: string; email: string; expiresAt: Date }): Promise<void>
  /** Finds an unexpired token by hash and deletes it in the same step. Returns its email. */
  takeToken(tokenHash: string, now: Date): Promise<string | null>
  deleteTokensFor(email: string): Promise<void>
  /** Confirms an unconfirmed account. False if there's no such account (it expired or was confirmed). */
  markVerified(email: string): Promise<boolean>
  sendEmail(email: VerifyEmail): Promise<void>
  /** Counts one email to this address against its limit; false when it's used up. */
  allowEmail(email: string): Promise<boolean>
  newToken?: () => string
  now?: () => Date
}

/** What happened, for logs and tests only. The visitor sees the same page whatever it is. */
export type SendOutcome = "sent" | "limited"
export type SignupOutcome = "created" | "created-limited" | "exists-notified" | "exists-limited" | "exists"

/** Emails a new confirmation link, unless this address has had too many emails lately. */
export async function sendVerification(email: string, base: string, deps: VerifyDeps): Promise<SendOutcome> {
  if (!(await deps.allowEmail(email))) return "limited"
  const token = (deps.newToken ?? newResetToken)()
  const now = (deps.now ?? (() => new Date()))()
  await deps.saveToken({
    tokenHash: hashResetToken(token),
    email,
    expiresAt: new Date(now.getTime() + VERIFY_LINK_TTL_HOURS * 60 * 60_000),
  })
  await deps.sendEmail(verificationEmail(email, verifyLink(base, token)))
  return "sent"
}

/** Creates an unconfirmed account and emails the link, or tells the owner of a taken address. */
export async function startSignup(email: string, password: string, base: string, deps: VerifyDeps): Promise<SignupOutcome> {
  const existing = await deps.findAccount(email)
  if (existing) {
    if (!(await deps.allowEmail(email))) return "exists-limited"
    await deps.sendEmail(existingAccountEmail(existing.email, base, existing))
    return "exists-notified"
  }
  const now = (deps.now ?? (() => new Date()))()
  // Lost a race with another sign-up for the same address: that one sends the email.
  if (!(await deps.createAccount(email, password, unverifiedExpiry(now)))) return "exists"
  return (await sendVerification(email, base, deps)) === "sent" ? "created" : "created-limited"
}

/**
 * startSignup for the sign-up form: never throws, so a failure can't change what the visitor sees
 * (which would reveal whether the address has an account). Runs after the reply is sent.
 */
export async function startSignupQuietly(email: string, password: string, base: string, deps: VerifyDeps): Promise<SignupOutcome | "failed"> {
  try {
    return await startSignup(email, password, base, deps)
  } catch {
    return "failed"
  }
}

export const INVALID_VERIFY_LINK =
  "This confirmation link is invalid or has expired. Log in with your email and password to get a new one."

export type ConfirmResult = { ok: true; email: string } | { ok: false; error: string }

export async function confirmEmail(token: unknown, deps: VerifyDeps): Promise<ConfirmResult> {
  if (!isResetTokenShape(token)) return { ok: false, error: INVALID_VERIFY_LINK }
  const now = (deps.now ?? (() => new Date()))()
  const email = await deps.takeToken(hashResetToken(token), now)
  if (!email) return { ok: false, error: INVALID_VERIFY_LINK }
  const confirmed = await deps.markVerified(email)
  await deps.deleteTokensFor(email)
  return confirmed ? { ok: true, email } : { ok: false, error: INVALID_VERIFY_LINK }
}
