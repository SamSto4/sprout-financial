// When a signed-in session stops being valid. Kept free of framework imports so it can be
// unit-tested with `node --test`; lib/auth/auth.ts applies it in the Auth.js jwt callback.
//
// Sessions are signed JWT cookies, which nothing on the server can delete. Without this rule a
// password reset would leave every existing session working for up to 30 days, including the
// session of whoever the reset was meant to lock out. That matters here because sign-up doesn't
// verify email addresses: someone can register a stranger's email, stay signed in, and keep reading
// whatever the real owner syncs after "taking the account back" with a reset. (OWASP ASVS 4.0.3,
// V3.3.3: offer to end other sessions after a password change; we always do.)

/** The fields of the session token this rule reads. `iat` is set by Auth.js, in seconds. */
export type SessionTimes = { signedInAt?: unknown; iat?: unknown }

/**
 * When the session began, in milliseconds. Sessions created before this rule existed have no
 * `signedInAt`, so their `iat` (when the cookie was last re-signed) stands in for it.
 */
export function sessionStartedAt(token: SessionTimes): number | null {
  if (typeof token.signedInAt === "number" && Number.isFinite(token.signedInAt)) return token.signedInAt
  if (typeof token.iat === "number" && Number.isFinite(token.iat)) return token.iat * 1000
  return null
}

/** True when the account's password changed after this session began, so it must end. */
export function isSessionRevoked(startedAt: number | null, passwordChangedAt: Date | null | undefined): boolean {
  if (!(passwordChangedAt instanceof Date) || Number.isNaN(passwordChangedAt.getTime())) return false
  // A session we can't date is treated as older than the change.
  if (startedAt === null) return true
  return startedAt < passwordChangedAt.getTime()
}
