import "server-only"

import { checkPassword, createUserWithHash, findUserByEmail, hashPassword, normalizeEmail } from "@/lib/auth/users"
import type { PendingSignup, VerifyDeps } from "@/lib/auth/verify"
import { getDb } from "@/lib/db/mongodb"
import { sendEmail } from "@/lib/email/send"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor } from "@/lib/rate-limit/server"

// The sign-up confirmation rules (lib/auth/verify.ts) wired to MongoDB, bcrypt, email and rate limits.
// Collection `email_verifications`: one pending sign-up per row, { tokenHash, email, passwordHash,
// expiresAt }. Only hashes are stored, and MongoDB deletes expired rows on its own (TTL index in
// lib/db/mongodb.ts).

type PendingDoc = PendingSignup & { createdAt: Date }

async function pendingSignups() {
  return (await getDb()).collection<PendingDoc>("email_verifications")
}

export const verifyDeps: VerifyDeps = {
  async findAccount(email) {
    const user = await findUserByEmail(email)
    return user ? { email: user.email, hasPassword: Boolean(user.passwordHash) } : null
  },
  hashPassword,
  checkPassword,
  async savePending(record) {
    await (await pendingSignups()).insertOne({ ...record, email: normalizeEmail(record.email), createdAt: new Date() })
  },
  async findPending(tokenHash, now) {
    const row = await (await pendingSignups()).findOne({ tokenHash, expiresAt: { $gt: now } })
    return row ? { email: row.email, passwordHash: row.passwordHash } : null
  },
  async deletePendingFor(email) {
    await (await pendingSignups()).deleteMany({ email: normalizeEmail(email) })
  },
  createAccount: createUserWithHash,
  sendEmail,
  async allowEmail(email) {
    const decision = await checkRateLimitFor("verifyEmailSend", accountKey(email))
    if (decision.allowed) return "ok"
    return decision.scope === "everyone" ? "total" : "address"
  },
}
