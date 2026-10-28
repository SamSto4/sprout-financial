// Checking a two-step code before something a signed-in person asks for: turning two-step
// verification off, making new recovery codes, or deleting the account. Pure, with the checks
// passed in, so it can be unit-tested with `node --test`; used by two-factor-actions.ts and, through
// checkDeletionCode in account-deletion.ts, by DELETE /api/account.
//
// These codes are what stops someone who only holds a signed-in browser, so they're guarded like
// codes typed at login: every code checked counts against twoFactorCode (5 per 15 minutes, 20 a day
// per account), every wrong one is written to the security log, and reaching the limit emails the
// owner, at most once a day.
//
// A Google-only account has no password login for two-step verification to protect, so there it
// only guards these actions. For turning it off and deleting the account, a Google sign-in made in
// the last few minutes (isFreshGoogleSignIn in session-version.ts) stands in for the code: an old
// or copied session can't make one, and without it an owner who never had the authenticator
// (someone else turned it on) or lost it would have no way out at all.

/** What the code is for, as kept in the security log. */
export type CodeAction = "off" | "new-codes" | "delete"
export const CODE_ACTIONS: readonly CodeAction[] = ["off", "new-codes", "delete"]

/** The longest code read (a recovery code has 16 characters plus dashes). */
export const MAX_CODE_LENGTH = 64

/** What checking a code found (checkSecondFactor in two-factor-server.ts). */
export type CodeCheckResult = { status: "ok"; usedRecoveryCode: boolean } | { status: "invalid" | "not-enabled" | "unavailable" }

export type CodeCheckOutcome = CodeCheckResult | { status: "missing" } | { status: "limited"; retryAfterSeconds: number }

export type CodeCheckDeps = {
  /** Counts one code against twoFactorCode; seconds to wait when it's used up, else null. */
  limited(): Promise<number | null>
  /** Checks the code and uses it up when it's right. */
  check(code: string): Promise<CodeCheckResult>
  /** Writes a wrong code to the security log. Never throws. */
  wrongCode(): Promise<void>
  /** Tells the owner that codes are being refused (sent at most once a day). Never throws. */
  limitReached(): void
}

/**
 * - "missing": no code, or not one that could be read; nothing is counted or checked.
 * - "limited": too many codes tried; this one isn't checked.
 * - otherwise what the check found. Every code that's checked has been counted first.
 */
export async function checkCode(code: unknown, deps: CodeCheckDeps): Promise<CodeCheckOutcome> {
  if (typeof code !== "string" || code.trim() === "" || code.length > MAX_CODE_LENGTH) return { status: "missing" }
  const wait = await deps.limited()
  if (wait !== null) {
    deps.limitReached()
    return { status: "limited", retryAfterSeconds: wait }
  }
  const result = await deps.check(code)
  if (result.status === "invalid") await deps.wrongCode()
  return result
}
