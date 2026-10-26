import "server-only"

import { createUser, findUserByEmail, markEmailVerified, normalizeEmail } from "@/lib/auth/users"
import type { VerifyDeps } from "@/lib/auth/verify"
import { getDb } from "@/lib/db/mongodb"
import { sendEmail } from "@/lib/email/send"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor } from "@/lib/rate-limit/server"

// The email verification rules (lib/auth/verify.ts) wired to MongoDB, email and rate limits.
// Collection `email_verifications`: { tokenHash, email, expiresAt }. Only the token's hash is
// stored, and MongoDB deletes expired rows on its own (TTL index in lib/db/mongodb.ts).

type VerificationDoc = { tokenHash: string; email: string; expiresAt: Date; createdAt: Date }

async function verifications() {
  return (await getDb()).collection<VerificationDoc>("email_verifications")
}

export const verifyDeps: VerifyDeps = {
  async findAccount(email) {
    const user = await findUserByEmail(email)
    return user ? { email: user.email, hasPassword: Boolean(user.passwordHash), verified: !user.unverifiedExpiresAt } : null
  },
  createAccount: (email, password, unverifiedUntil) => createUser(email, password, unverifiedUntil),
  async saveToken({ tokenHash, email, expiresAt }) {
    await (await verifications()).insertOne({ tokenHash, email: normalizeEmail(email), expiresAt, createdAt: new Date() })
  },
  async takeToken(tokenHash, now) {
    // Find and delete in one step, so the same link can't be used twice at once.
    const row = await (await verifications()).findOneAndDelete({ tokenHash, expiresAt: { $gt: now } })
    return row?.email ?? null
  },
  async deleteTokensFor(email) {
    await (await verifications()).deleteMany({ email: normalizeEmail(email) })
  },
  markVerified: markEmailVerified,
  sendEmail,
  async allowEmail(email) {
    return (await checkRateLimitFor("verifyEmailSend", accountKey(email))).allowed
  },
}
