// Which sign-in sessions a password change ends. Pure and tested; wired into the `jwt` callback in
// lib/auth/auth.ts.
//
// Sessions are signed cookies, so the server can't delete them. Instead each one records when the
// person signed in, and the account records when its password last changed. A session from before
// the change is refused, so resetting a password logs out every other device, including one an
// attacker may be using.

/** How long one server instance trusts its copy of an account's password-change time. */
export const PASSWORD_CHECK_CACHE_MS = 60_000

/**
 * True when the session started before the password last changed.
 * `signedInAt` is unknown on cookies issued before this check existed: those count as stale only
 * if the password has been changed since, which is when it matters.
 */
export function isSessionStale(signedInAt: unknown, passwordChangedAt: Date | null | undefined): boolean {
  if (!passwordChangedAt) return false
  const changed = passwordChangedAt.getTime()
  if (!Number.isFinite(changed)) return false
  if (typeof signedInAt !== "number" || !Number.isFinite(signedInAt)) return true
  return signedInAt < changed
}

/** A tiny per-instance cache, so checking every request doesn't read the database every request. */
export function createChangedAtCache(now: () => number = Date.now) {
  const entries = new Map<string, { value: Date | null; at: number }>()
  return {
    get(email: string): Date | null | undefined {
      const entry = entries.get(email)
      if (!entry) return undefined
      if (now() - entry.at > PASSWORD_CHECK_CACHE_MS) {
        entries.delete(email)
        return undefined
      }
      return entry.value
    },
    set(email: string, value: Date | null) {
      // Bounded: drop the oldest entry rather than grow forever.
      if (entries.size >= 5000) entries.delete(entries.keys().next().value as string)
      entries.set(email, { value, at: now() })
    },
    forget(email: string) {
      entries.delete(email)
    },
  }
}

/**
 * The longest a session lasts from sign-in, however active it is. Auth.js re-issues the cookie on
 * every visit, so without a fixed limit a session could last forever, including past the 31-day
 * record of an account deletion (deleted_accounts, lib/auth/account-deletion.ts). A password reset
 * needs no such record: passwordChangedAt stays on the user. OWASP ASVS
 * 4.0.3 V3.3.4 (absolute session timeout).
 */
export const MAX_SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** True once a session that began at `signedInAt` has passed MAX_SESSION_AGE_MS. */
export function isSessionExpired(signedInAt: unknown, now: number): boolean {
  return typeof signedInAt === "number" && Number.isFinite(signedInAt) && now - signedInAt > MAX_SESSION_AGE_MS
}

/**
 * How long a sign-in counts as fresh: proof the account holder is here now, not just someone with
 * an old or copied session cookie.
 */
export const FRESH_SIGN_IN_MS = 10 * 60_000

/**
 * True when the session began with a Google sign-in less than FRESH_SIGN_IN_MS ago. `authMethod`
 * and `authTime` are the session's own record of how it began (the jwt callback in lib/auth/auth.ts
 * writes them only at sign-in), so a session from before they existed is never fresh. A Google-only
 * account uses this in place of a password or code (lib/auth/two-factor-code.ts).
 */
export function isFreshGoogleSignIn(authMethod: unknown, authTime: unknown, now: number): boolean {
  if (authMethod !== "google" || typeof authTime !== "number" || !Number.isFinite(authTime)) return false
  const age = now - authTime
  // A minute of leeway for a sign-in recorded by a server whose clock runs a little ahead.
  return age >= -60_000 && age <= FRESH_SIGN_IN_MS
}
