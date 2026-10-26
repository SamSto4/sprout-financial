import "server-only"

import { currentUserEmail } from "@/lib/auth/session"
import { accountExists } from "@/lib/auth/users"
import { isDatabaseConfigured } from "@/lib/db/mongodb"

/** The signed-in user's email, or the error response to return instead. */
export async function requireUser(): Promise<{ email: string } | { response: Response }> {
  if (!isDatabaseConfigured()) {
    return { response: Response.json({ error: "Accounts aren't set up on this server." }, { status: 503 }) }
  }
  const email = await currentUserEmail()
  if (!email) return { response: Response.json({ error: "Log in to sync your data." }, { status: 401 }) }
  // A deleted account's session can outlive the deletion for up to a minute (the jwt check is
  // cached), so confirm the account still exists before reading or writing its data. Otherwise
  // another device still signed in could re-upload what was just deleted.
  try {
    if (!(await accountExists(email))) {
      return { response: Response.json({ error: "This account no longer exists. Log in again." }, { status: 401 }) }
    }
  } catch (error) {
    console.error("Couldn't check the account:", error instanceof Error ? error.message : error)
    return { response: Response.json({ error: "Couldn't reach your account just now." }, { status: 503 }) }
  }
  return { email }
}

/** Reads a JSON body, returning undefined when it's missing or malformed. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
