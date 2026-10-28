import "server-only"

import type { Session } from "next-auth"
import { unstable_rethrow } from "next/navigation"

import { auth } from "@/lib/auth/auth"
import { isFreshGoogleSignIn } from "@/lib/auth/session-version"
import { findUserByEmail, normalizeEmail } from "@/lib/auth/users"

/** The signed-in user's email, which keys all of their synced data, or null. */
export async function currentUserEmail() {
  const session = await auth()
  const email = session?.user?.email
  return email ? normalizeEmail(email) : null
}

/**
 * For pages that only change their copy for signed-in visitors (the home page and the FAQ): the
 * signed-in email, or null when nobody is signed in or the session can't be read. A failure is
 * logged rather than thrown, so an auth or database hiccup shows the signed-out page instead of an
 * error. Never use this to protect data: use requireUser() in lib/auth/guard.ts for that.
 */
export async function viewerEmail(): Promise<string | null> {
  try {
    return await currentUserEmail()
  } catch (error) {
    unstable_rethrow(error)
    console.error("Couldn't read the session:", error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * True when `email` is a Google-only account (no password) and this session began with a Google
 * sign-in in the last few minutes (isFreshGoogleSignIn). Such an account has no password to
 * confirm, so this is what turning two-step verification on asks for, and what can stand in for a
 * two-step code when turning it off or deleting the account (lib/auth/two-factor-code.ts).
 */
export async function freshGoogleOnlySignIn(email: string): Promise<boolean> {
  const session = await auth()
  const sessionEmail = session?.user?.email
  if (!sessionEmail || normalizeEmail(sessionEmail) !== normalizeEmail(email)) return false
  if (!isFreshGoogleSession(session)) return false
  const user = await findUserByEmail(email)
  return Boolean(user && !user.passwordHash)
}

/** isFreshGoogleSignIn for a session already read with auth(), now. */
export function isFreshGoogleSession(session: Session | null): boolean {
  return isFreshGoogleSignIn(session?.authMethod, session?.authTime, Date.now())
}
