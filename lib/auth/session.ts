import "server-only"

import { unstable_rethrow } from "next/navigation"

import { auth } from "@/lib/auth/auth"
import { normalizeEmail } from "@/lib/auth/users"

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
