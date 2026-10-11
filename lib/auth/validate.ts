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
