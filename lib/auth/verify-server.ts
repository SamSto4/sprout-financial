import "server-only"

import { checkPassword, createUserWithHash, findUserByEmail, hashPassword, normalizeEmail } from "@/lib/auth/users"
import { MAX_CONFIRM_ATTEMPTS, type PendingSignup, type VerifyDeps } from "@/lib/auth/verify"
import { getDb } from "@/lib/db/mongodb"
import { sendEmail } from "@/lib/email/send"
import { accountKey } from "@/lib/rate-limit/limits"
import { checkRateLimitFor } from "@/lib/rate-limit/server"

// The sign-up confirmation rules (lib/auth/verify.ts) wired to MongoDB, bcrypt, email and rate limits.
// Collection `email_verifications`: one pending sign-up per row, { tokenHash, email, passwordHash,
// expiresAt }. Only hashes are stored, and MongoDB deletes expired rows on its own (TTL index in
// lib/db/mongodb.ts).

type PendingDoc = PendingSignup & { createdAt: Date; attempts?: number }

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
    // Find and count the try in one step, before the password is checked: requests sent at the
    // same moment can't all pass the attempts filter, so at most MAX_CONFIRM_ATTEMPTS passwords are
    // ever compared against one link.
    const row = await (await pendingSignups()).findOneAndUpdate(
      {
        tokenHash,
        expiresAt: { $gt: now },
        $or: [{ attempts: { $exists: false } }, { attempts: { $lt: MAX_CONFIRM_ATTEMPTS } }],
      },
      { $inc: { attempts: 1 } },
      { returnDocument: "after" }
    )
    return row ? { email: row.email, passwordHash: row.passwordHash, attempts: row.attempts ?? MAX_CONFIRM_ATTEMPTS } : null
  },
  async recordWrongPassword(tokenHash, attempts) {
    // The try was already counted by findPending; this only removes a link with none left.
    const left = MAX_CONFIRM_ATTEMPTS - attempts
    if (left <= 0) await (await pendingSignups()).deleteOne({ tokenHash })
    return Math.max(0, left)
  },
  async deletePendingFor(email) {
    await (await pendingSignups()).deleteMany({ email: normalizeEmail(email) })
  },
  createAccount: createUserWithHash,
  sendEmail,
  // Replaced per request by signupEmailAllowance(visitorKey(headers)) in the sign-up action; this is the IP-less fallback.
  allowEmail: (email) => signupEmailAllowance("unknown")(email),
}

/**
 * The email limits for one sign-up request. Counted per address *and sender IP* first (3 an hour),
 * so one person repeating the form can't use up someone else's allowance and block their sign-up;
 * then per address alone (10 an hour), so nobody can flood an inbox from many IPs; then in total.
 * Repeating it from four or more IPs can still block one address for the hour; a CAPTCHA on
 * sign-up is the fix if that's ever seen. `visitor` is visitorKey(headers) (a hash, never the
 * address itself), so the counter doesn't tie the account key to an IP address.
 */
export function signupEmailAllowance(visitor: string): VerifyDeps["allowEmail"] {
  return async (email) => {
    const fromHere = await checkRateLimitFor("verifyEmailSendFrom", `${accountKey(email)}:${visitor}`)
    if (!fromHere.allowed) return "address"
    const decision = await checkRateLimitFor("verifyEmailSend", accountKey(email))
    if (decision.allowed) return "ok"
    return decision.scope === "everyone" ? "total" : "address"
  }
}
