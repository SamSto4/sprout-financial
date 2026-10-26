// Email verification for password sign-ups: the rules, with storage, hashing and email passed in so
// they can be unit-tested with `node --test`. The server wiring (MongoDB, bcrypt, Resend, rate
// limits) is in verify-server.ts.
//
// Why: accounts are keyed by email, and without this anyone could register a stranger's address.
//
// How it works:
// 1. Sign-up creates no account. It saves a pending sign-up (email, bcrypt hash of the chosen
//    password, the hash of a random token, 24-hour expiry) and emails a link with the token.
//    If the address already has an account, it emails the owner how to log in instead.
//    Either way the form answers "check your email", after the reply has gone (see actions.ts),
//    and nothing can be logged in to before confirmation, so neither the form nor a login attempt
//    reveals which addresses are registered.
// 2. The link opens /verify-email?token=..., which asks for the password chosen at sign-up. Only
//    someone with the inbox (the link) AND the password can create the account. So a stranger who
//    signs up with your address can't finish, and you can't be tricked into confirming an account
//    whose password they chose.
// 3. On success the account is created, every pending sign-up for that address is removed, and the
//    person is logged in. A typo doesn't use up the link, but MAX_CONFIRM_ATTEMPTS wrong passwords
//    delete it, so someone who got hold of the link can't keep guessing.
// 4. Didn't get the email, or it expired? Sign up again; each sign-up is its own pending entry.
//
// Tokens work like reset tokens: 32 random bytes, only the SHA-256 hash stored.

import { hashResetToken, isResetTokenShape, newResetToken } from "./reset.ts"

export const VERIFY_LINK_TTL_HOURS = 24
/** Wrong passwords a link survives. Then it's deleted, so a leaked link can't be guessed against. */
export const MAX_CONFIRM_ATTEMPTS = 5

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
    `You'll need the password you chose when you signed up. The link expires in ${VERIFY_LINK_TTL_HOURS} hours.`,
    "If you didn't sign up for Sprout, ignore this email. No account is created unless this link is used.",
  ].join("\n")
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Confirm your email to finish creating your Sprout account.</p>
<p><a href="${escapeHtml(link)}" style="${BUTTON_STYLE}">Confirm my email</a></p>
<p style="${FOOTER_STYLE}">You'll need the password you chose when you signed up. The link expires in ${VERIFY_LINK_TTL_HOURS} hours. If you didn't sign up for Sprout, ignore this email. No account is created unless this link is used.</p>
</div>`
  return { to, subject: "Confirm your email for Sprout", text, html }
}

/** Sent when someone signs up with an address that already has an account. */
export function existingAccountEmail(to: string, base: string, account: Pick<SignupAccount, "hasPassword">): VerifyEmail {
  const login = `${base}/login`
  const forgot = `${base}/forgot-password`
  const text = [
    "Someone tried to create a Sprout account with this email, but there's already an account for it.",
    "",
    account.hasPassword
      ? `Log in here: ${login}\nForgot your password? Choose a new one here: ${forgot}`
      : `Your account signs in with Google. Use "Continue with Google" on the login page: ${login}`,
    "",
    "If this wasn't you, you can ignore this email. Nothing has changed.",
  ].join("\n")
  const what = account.hasPassword
    ? `<p><a href="${escapeHtml(login)}" style="${BUTTON_STYLE}">Log in</a></p><p>Forgot your password? <a href="${escapeHtml(forgot)}">Choose a new one</a>.</p>`
    : `<p>Your account signs in with Google. Use <strong>Continue with Google</strong> on the <a href="${escapeHtml(login)}">login page</a>.</p>`
  const html = `<div style="font-family:system-ui,sans-serif;color:#18352A;max-width:480px">
<p>Someone tried to create a Sprout account with this email, but there's already an account for it.</p>
${what}
<p style="${FOOTER_STYLE}">If this wasn't you, you can ignore this email. Nothing has changed.</p>
</div>`
  return { to, subject: "You already have a Sprout account", text, html }
}

export type SignupAccount = { email: string; hasPassword: boolean }
export type PendingSignup = { tokenHash: string; email: string; passwordHash: string; expiresAt: Date }

/** Storage, hashing, email and the email limits, supplied by the server (or by a test). */
export type VerifyDeps = {
  findAccount(email: string): Promise<SignupAccount | null>
  hashPassword(password: string): Promise<string>
  checkPassword(password: string, passwordHash: string): Promise<boolean>
  savePending(record: PendingSignup): Promise<void>
  /** An unexpired pending sign-up by token hash with attempts left (not removed: a typo mustn't use up the link). */
  findPending(tokenHash: string, now: Date): Promise<{ email: string; passwordHash: string } | null>
  /** Counts a wrong password against the link, deleting it once MAX_CONFIRM_ATTEMPTS is reached. Returns tries left. */
  recordWrongPassword(tokenHash: string): Promise<number>
  deletePendingFor(email: string): Promise<void>
  /** Creates the account with an already-hashed password. False if the email is already taken. */
  createAccount(email: string, passwordHash: string): Promise<boolean>
  sendEmail(email: VerifyEmail): Promise<void>
  /** Counts one email to this address against the limits. "address": too many to it; "total": too many overall. */
  allowEmail(email: string): Promise<"ok" | "address" | "total">
  newToken?: () => string
  now?: () => Date
}

/** What happened, for logs and tests only. The visitor sees the same page whatever it is. */
export type SignupOutcome = "sent" | "exists-notified" | "limited-address" | "limited-total"

/** Saves a pending sign-up and emails its link, or tells the owner of a taken address. */
export async function startSignup(email: string, password: string, base: string, deps: VerifyDeps): Promise<SignupOutcome> {
  // Checked before any hashing, so a flood costs as little as possible.
  const allowed = await deps.allowEmail(email)
  if (allowed !== "ok") return allowed === "address" ? "limited-address" : "limited-total"

  const existing = await deps.findAccount(email)
  if (existing) {
    await deps.sendEmail(existingAccountEmail(existing.email, base, existing))
    return "exists-notified"
  }
  const token = (deps.newToken ?? newResetToken)()
  const now = (deps.now ?? (() => new Date()))()
  await deps.savePending({
    tokenHash: hashResetToken(token),
    email,
    passwordHash: await deps.hashPassword(password),
    expiresAt: new Date(now.getTime() + VERIFY_LINK_TTL_HOURS * 60 * 60_000),
  })
  await deps.sendEmail(verificationEmail(email, verifyLink(base, token)))
  return "sent"
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

export const INVALID_VERIFY_LINK = "This confirmation link is invalid or has expired. Sign up again to get a new one."
export const WRONG_SIGNUP_PASSWORD =
  "That isn't the password chosen for this sign-up. Try again. (Didn't sign up? Someone may have used your address; you can ignore it.)"
export const TOO_MANY_WRONG = "Too many wrong passwords, so this link no longer works. Sign up again to get a new one."
export const ALREADY_REGISTERED = "This email already has an account. Log in instead."

/** Long enough for any real password (sign-up allows at most 72 bytes); stops huge inputs reaching bcrypt. */
const MAX_PASSWORD_INPUT = 200

export type ConfirmResult = { ok: true; email: string } | { ok: false; error: string; invalidLink?: boolean }

export async function confirmSignup(token: unknown, password: unknown, deps: VerifyDeps): Promise<ConfirmResult> {
  if (!isResetTokenShape(token)) return { ok: false, error: INVALID_VERIFY_LINK, invalidLink: true }
  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_INPUT) {
    return { ok: false, error: WRONG_SIGNUP_PASSWORD }
  }
  const now = (deps.now ?? (() => new Date()))()
  const pending = await deps.findPending(hashResetToken(token), now)
  if (!pending) return { ok: false, error: INVALID_VERIFY_LINK, invalidLink: true }
  if (!(await deps.checkPassword(password, pending.passwordHash))) {
    const left = await deps.recordWrongPassword(hashResetToken(token))
    return left > 0 ? { ok: false, error: WRONG_SIGNUP_PASSWORD } : { ok: false, error: TOO_MANY_WRONG, invalidLink: true }
  }

  const created = await deps.createAccount(pending.email, pending.passwordHash)
  // Done either way: every other pending sign-up for this address is now void.
  await deps.deletePendingFor(pending.email)
  return created ? { ok: true, email: pending.email } : { ok: false, error: ALREADY_REGISTERED, invalidLink: true }
}
