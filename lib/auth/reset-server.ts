import "server-only"

import type { ResetDeps } from "@/lib/auth/reset"
import { findUserByEmail, normalizeEmail, setPassword } from "@/lib/auth/users"
import { getDb } from "@/lib/db/mongodb"
import { sendEmail } from "@/lib/email/send"

// The password reset rules (lib/auth/reset.ts) wired to MongoDB and email.
// Collection `password_resets`: { tokenHash, email, expiresAt }. Only the token's hash is stored,
// and MongoDB deletes expired rows on its own (TTL index in lib/db/mongodb.ts).

type ResetDoc = { tokenHash: string; email: string; expiresAt: Date; createdAt: Date }

async function resets() {
  return (await getDb()).collection<ResetDoc>("password_resets")
}

export const resetDeps: ResetDeps = {
  async findAccount(email) {
    const user = await findUserByEmail(email)
    return user ? { email: user.email, hasPassword: Boolean(user.passwordHash) } : null
  },
  async saveToken({ tokenHash, email, expiresAt }) {
    await (await resets()).insertOne({ tokenHash, email: normalizeEmail(email), expiresAt, createdAt: new Date() })
  },
  async takeToken(tokenHash, now) {
    // Find and delete in one step, so the same link can't be used twice at once.
    const row = await (await resets()).findOneAndDelete({ tokenHash, expiresAt: { $gt: now } })
    return row?.email ?? null
  },
  async deleteTokensFor(email) {
    await (await resets()).deleteMany({ email: normalizeEmail(email) })
  },
  setPassword,
  sendEmail,
}
