// Login form checks and redirect safety. Kept free of framework imports so it can be unit-tested.

export const MIN_PASSWORD_LENGTH = 8
/**
 * bcrypt only reads the first 72 bytes of a password and silently ignores the rest, so a longer
 * password would look stronger than it is. New passwords are capped at 72 bytes (UTF-8, so fewer
 * characters when they include accents or emoji).
 */
export const MAX_PASSWORD_BYTES = 72
/** Logging in still accepts longer input, so accounts made before the 72-byte cap keep working. */
const MAX_LOGIN_PASSWORD_LENGTH = 200

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CredentialsResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string }

export function passwordBytes(password: string) {
  return new TextEncoder().encode(password).length
}

export function validateCredentials(
  email: unknown,
  password: unknown,
  intent: "login" | "signup" = "login"
): CredentialsResult {
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." }
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (intent === "signup" && passwordBytes(password) > MAX_PASSWORD_BYTES) {
    return { ok: false, error: `Passwords can be at most ${MAX_PASSWORD_BYTES} characters.` }
  }
  if (password.length > MAX_LOGIN_PASSWORD_LENGTH) {
    return { ok: false, error: "Wrong email or password." }
  }
  return { ok: true, email: email.trim().toLowerCase(), password }
}

const REDIRECT_BASE = "https://sprout.invalid"

/**
 * Keeps a post-login redirect on this site (CWE-601). Only single-slash relative paths are allowed:
 * "//evil.test" and "/\\evil.test" are browser-legal absolute URLs, so a bare startsWith("/")
 * check would be an open redirect. Browsers also delete tabs and newlines anywhere in a URL, so
 * "/\t/evil.test" turns into "//evil.test"; any control character or backslash is refused, and the
 * result is parsed the way a browser would to confirm it stays on this site.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return "/"
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith("//")) return "/"
  try {
    const url = new URL(value, REDIRECT_BASE)
    return url.origin === REDIRECT_BASE ? value : "/"
  } catch {
    return "/"
  }
}

/** Codes the sign-in flow puts in /login?error=..., and what to tell the user for each. */
export const SIGN_IN_ERRORS = {
  /** Google sign-in for an email that already has a password account (see lib/auth/auth.ts). */
  PasswordAccount: "This email already has a password account. Log in with your email and password instead.",
  AccessDenied: "That sign-in couldn't be completed. Try again, or log in with your email and password.",
} as const

/** The message for an error code from the URL, or null when there's nothing to show. */
export function signInErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null
  return code in SIGN_IN_ERRORS
    ? SIGN_IN_ERRORS[code as keyof typeof SIGN_IN_ERRORS]
    : "Something went wrong signing you in. Please try again."
}
