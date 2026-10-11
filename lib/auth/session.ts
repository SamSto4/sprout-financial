import "server-only"

import { auth } from "@/lib/auth/auth"
import { normalizeEmail } from "@/lib/auth/users"

/** The signed-in user's email, which keys all of their synced data, or null. */
export async function currentUserEmail() {
  const session = await auth()
  const email = session?.user?.email
  return email ? normalizeEmail(email) : null
}
