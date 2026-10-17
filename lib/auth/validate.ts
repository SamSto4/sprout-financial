// Login form checks and redirect safety. Kept free of framework imports so it can be unit-tested.

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 200

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CredentialsResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string }

export function validateCredentials(email: unknown, password: unknown): CredentialsResult {
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim()) || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." }
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `Passwords can be at most ${MAX_PASSWORD_LENGTH} characters.` }
  }
  return { ok: true, email: email.trim().toLowerCase(), password }
}

/**
 * Keeps a post-login redirect on this site. Only single-slash relative paths are allowed:
 * "//evil.test" and "/\\evil.test" are browser-legal absolute URLs, so a bare startsWith("/")
 * check would be an open redirect.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/"
  if (value.startsWith("//") || value.startsWith("/\\")) return "/"
  return value
}

/**
 * The message for an Auth.js error code (the login page's ?error=), or null when there is none.
 * Codes come from the URL, so anything unrecognized gets the generic message.
 */
export function authErrorMessage(code: unknown): string | null {
  if (typeof code !== "string" || code === "") return null
  switch (code) {
    case "Configuration":
      return "Sign-in isn't working on this site right now. Please try again later."
    case "AccessDenied":
      return "Google sign-in was cancelled or not allowed. Please try again."
    case "Verification":
      return "That sign-in link has expired. Please try again."
    case "CredentialsSignin":
      return "Wrong email or password."
    default:
      return "Something went wrong signing you in. Please try again."
  }
}
