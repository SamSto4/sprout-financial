import "server-only"

import { compare, hash } from "bcryptjs"

import { deletionRecordExpiry, sessionsEndedAt as latestSessionEnd } from "@/lib/auth/account-deletion"
import { createChangedAtCache } from "@/lib/auth/session-version"
import { deleteAccountData } from "@/lib/db/account-data"
import { getDb } from "@/lib/db/mongodb"
import { accountKey } from "@/lib/rate-limit/limits"

export type UserDoc = {
  email: string
  name: string
  image?: string
  /** Absent on accounts created with Google. */
  passwordHash?: string
  /** When the password was last set by a reset. Sessions that started earlier are refused. */
  passwordChangedAt?: Date
  /**
   * Only on a password account whose email isn't confirmed yet (lib/auth/verify.ts): it can't log
   * in, and MongoDB deletes it at this time (TTL index). Absent means confirmed, including every
   * account created before verification existed and every Google account.
   */
  unverifiedExpiresAt?: Date
  authProviders: string[]
  createdAt: Date
  updatedAt: Date
}

// A valid bcrypt hash no password matches. Comparing against it when the email is unknown makes
// a miss take as long as a wrong password, so timing doesn't reveal which emails are registered.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
const SALT_ROUNDS = 10

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

async function users() {
  return (await getDb()).collection<UserDoc>("users")
}

export async function findUserByEmail(email: string) {
  return (await users()).findOne({ email: normalizeEmail(email) })
}

/**
 * A new account starts empty. Synced data is only written for an existing account, but an upload
 * that was already on its way when an account was deleted can land just after; without this, the
 * next person to register that email would inherit it. Runs before the new account's first session.
 */
async function clearLeftoverData(email: string) {
  await deleteAccountData(email)
}

/**
 * Creates a password account. Returns false if the email is already registered. With
 * `unverifiedUntil`, the account is unconfirmed until its owner opens the emailed link.
 */
export async function createUser(email: string, password: string, unverifiedUntil?: Date) {
  const now = new Date()
  try {
    await (await users()).insertOne({
      email: normalizeEmail(email),
      name: "",
      passwordHash: await hash(password, SALT_ROUNDS),
      authProviders: ["credentials"],
      ...(unverifiedUntil ? { unverifiedExpiresAt: unverifiedUntil } : {}),
      createdAt: now,
      updatedAt: now,
    })
    await clearLeftoverData(normalizeEmail(email))
    return true
  } catch (error) {
    // Duplicate key: two sign-ups raced, or the email exists.
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}

/**
 * Replaces the password of an existing account (used by password reset). Also records when, which
 * ends every session that started before now (see lib/auth/session-version.ts). The reset link
 * went to the account's inbox, so this confirms the email too.
 */
export async function setPassword(email: string, password: string) {
  const now = new Date()
  await (await users()).updateOne(
    { email: normalizeEmail(email) },
    {
      $set: { passwordHash: await hash(password, SALT_ROUNDS), passwordChangedAt: now, updatedAt: now },
      $unset: { unverifiedExpiresAt: "" },
      $addToSet: { authProviders: "credentials" },
    }
  )
  changedAtCache.forget(normalizeEmail(email))
}

/** Confirms an unconfirmed account's email. False when there's no unconfirmed account for it. */
export async function markEmailVerified(email: string): Promise<boolean> {
  const result = await (await users()).updateOne(
    { email: normalizeEmail(email), unverifiedExpiresAt: { $exists: true } },
    { $unset: { unverifiedExpiresAt: "" }, $set: { updatedAt: new Date() } }
  )
  return result.modifiedCount > 0
}

/**
 * Hands an unconfirmed password account to the person signing in with Google for that address.
 * Google has confirmed they own it; whoever chose the password hasn't, so the password is removed
 * (and with it, their way in) before the first Google session starts. Pending confirmation and
 * reset links are dropped for the same reason.
 */
export async function claimUnverifiedAccount(email: string) {
  const key = normalizeEmail(email)
  const db = await getDb()
  await (await users()).updateOne(
    { email: key, unverifiedExpiresAt: { $exists: true } },
    { $unset: { unverifiedExpiresAt: "", passwordHash: "" }, $set: { authProviders: [], updatedAt: new Date() } }
  )
  await Promise.all([
    db.collection("email_verifications").deleteMany({ email: key }),
    db.collection("password_resets").deleteMany({ email: key }),
  ])
}

const changedAtCache = createChangedAtCache()

/** One per deleted account, keyed by accountKey(email) so no address is kept. Removes itself after 31 days. */
type DeletedAccountDoc = { _id: string; deletedAt: Date; expiresAt: Date }

async function deletedAccounts() {
  return (await getDb()).collection<DeletedAccountDoc>("deleted_accounts")
}

/**
 * The time before which every session for this email must end: the later of the last password
 * reset and the last account deletion (null if neither). Cached briefly per server instance.
 */
export async function sessionsEndedAt(email: string): Promise<Date | null> {
  const key = normalizeEmail(email)
  const cached = changedAtCache.get(key)
  if (cached !== undefined) return cached
  const [user, deleted] = await Promise.all([
    (await users()).findOne({ email: key }, { projection: { passwordChangedAt: 1 } }),
    (await deletedAccounts()).findOne({ _id: accountKey(key) }),
  ])
  const value = latestSessionEnd(user?.passwordChangedAt, deleted?.deletedAt)
  changedAtCache.set(key, value)
  return value
}

/** True when an account exists for this email. Synced data is only ever written for one that does. */
export async function accountExists(email: string): Promise<boolean> {
  return (await (await users()).countDocuments({ email: normalizeEmail(email) }, { limit: 1 })) > 0
}

/**
 * Removes the user and any pending reset or confirmation links, and records the deletion so sessions from before
 * now end on every device (lib/auth/account-deletion.ts). Synced chats and data are deleted
 * separately, by deleteAccountData in lib/db/account-data.ts.
 */
export async function deleteUser(email: string) {
  const key = normalizeEmail(email)
  const deletedAt = new Date()
  const db = await getDb()
  await (await deletedAccounts()).updateOne(
    { _id: accountKey(key) },
    { $set: { deletedAt, expiresAt: deletionRecordExpiry(deletedAt) } },
    { upsert: true }
  )
  await db.collection("password_resets").deleteMany({ email: key })
  await db.collection("email_verifications").deleteMany({ email: key })
  await (await users()).deleteOne({ email: key })
  changedAtCache.forget(key)
}

/** The user when the password matches, otherwise null. Never throws on a bad credential. */
export async function verifyPassword(email: string, password: string) {
  const user = await findUserByEmail(email)
  if (!user?.passwordHash) {
    await compare(password, DUMMY_HASH)
    return null
  }
  return (await compare(password, user.passwordHash)) ? user : null
}

/** Records a successful sign-in (creating the user on first Google sign-in). */
export async function recordSignIn(profile: { email: string; name?: string | null; image?: string | null }, provider?: string) {
  const email = normalizeEmail(profile.email)
  const now = new Date()
  const result = await (await users()).updateOne(
    { email },
    {
      $set: { updatedAt: now, ...(profile.name ? { name: profile.name } : {}), ...(profile.image ? { image: profile.image } : {}) },
      $setOnInsert: { email, createdAt: now, ...(profile.name ? {} : { name: "" }) },
      ...(provider ? { $addToSet: { authProviders: provider } } : {}),
    },
    { upsert: true }
  )
  // First Google sign-in created the account: start it empty too (see clearLeftoverData).
  if (result.upsertedCount > 0) await clearLeftoverData(email)
}
