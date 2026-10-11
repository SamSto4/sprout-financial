import "server-only"

import { currentUserEmail } from "@/lib/auth/session"
import { isDatabaseConfigured } from "@/lib/db/mongodb"

/** The signed-in user's email, or the error response to return instead. */
export async function requireUser(): Promise<{ email: string } | { response: Response }> {
  if (!isDatabaseConfigured()) {
    return { response: Response.json({ error: "Accounts aren't set up on this server." }, { status: 503 }) }
  }
  const email = await currentUserEmail()
  if (!email) return { response: Response.json({ error: "Log in to sync your data." }, { status: 401 }) }
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
