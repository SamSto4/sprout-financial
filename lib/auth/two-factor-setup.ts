// Starting two-step verification setup. Pure, with the storage and checks passed in, so it can be
// unit-tested with `node --test`; wired up by beginTwoFactorSetup in two-factor-actions.ts.
//
// Turning it on for a password account asks for the current password. Otherwise anyone holding a
// signed-in browser could add their own authenticator and keep the recovery codes: every password
// login would then need a code the owner doesn't have, a password reset leaves two-step
// verification on, and turning it off needs a code, so the owner would be locked out for good.
// Google-only accounts aren't asked: logging in with Google never needs the code.

export type TwoFactorActionResult =
  | { ok: true; qrSvg?: string; secret?: string; recoveryCodes?: string[] }
  | { ok: false; error: string }

export type BeginSetupDeps = {
  /** Counts one try against the account's two-step limit; the message to show when it's used up, else null. */
  limited(email: string): Promise<string | null>
  /** Whether the account logs in with a password; null when it can't be found. */
  hasPassword(email: string): Promise<boolean | null>
  /** True when the password is the account's current one. */
  checkPassword(email: string, password: string): Promise<boolean>
  /** Starts setup (a new secret, kept until a code confirms it); null when it's already on. */
  start(email: string): Promise<{ qrSvg: string; secret: string } | null>
  /** Notes a wrong password in the security log. */
  wrongPassword(email: string): Promise<void>
}

/** Longest password accepted, as at login (lib/auth/validate.ts). */
const MAX_PASSWORD_LENGTH = 200

export const SETUP_UNAVAILABLE = "Two-step verification isn't available right now. Please try again later."
export const WRONG_PASSWORD = "That password isn't right. Enter the password you log in to Sprout with."

export async function beginSetup(email: string, password: unknown, deps: BeginSetupDeps): Promise<TwoFactorActionResult> {
  const tooMany = await deps.limited(email)
  if (tooMany) return { ok: false, error: tooMany }
  const hasPassword = await deps.hasPassword(email)
  if (hasPassword === null) return { ok: false, error: SETUP_UNAVAILABLE }
  if (hasPassword) {
    if (typeof password !== "string" || password === "" || password.length > MAX_PASSWORD_LENGTH) {
      return { ok: false, error: "Enter your current password to turn on two-step verification." }
    }
    if (!(await deps.checkPassword(email, password))) {
      await deps.wrongPassword(email)
      return { ok: false, error: WRONG_PASSWORD }
    }
  }
  const setup = await deps.start(email)
  return setup ? { ok: true, qrSvg: setup.qrSvg, secret: setup.secret } : { ok: false, error: "Two-step verification is already on." }
}
