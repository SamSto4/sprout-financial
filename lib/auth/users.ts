import "server-only"

import { compare, hash } from "bcryptjs"

import { getDb } from "@/lib/db/mongodb"

export type UserDoc = {
  email: string
  name: string
  image?: string
  /** Absent on accounts created with Google. */
  passwordHash?: string
  /** Set by password reset. Sessions that began before it are ended (lib/auth/session-rules.ts). */
  passwordChangedAt?: Date
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

/** Creates a password account. Returns false if the email is already registered. */
export async function createUser(email: string, password: string) {
  const now = new Date()
  try {
    await (await users()).insertOne({
      email: normalizeEmail(email),
      name: "",
      passwordHash: await hash(password, SALT_ROUNDS),
      authProviders: ["credentials"],
      createdAt: now,
      updatedAt: now,
    })
    return true
  } catch (error) {
    // Duplicate key: two sign-ups raced, or the email exists.
    if ((error as { code?: number }).code === 11000) return false
    throw error
  }
}

/**
 * Replaces the password of an existing account (used by password reset). Recording when it changed
 * signs the account out everywhere: the jwt callback in lib/auth/auth.ts ends older sessions.
 */
export async function setPassword(email: string, password: string) {
  const now = new Date()
  await (await users()).updateOne(
    { email: normalizeEmail(email) },
    {
      $set: { passwordHash: await hash(password, SALT_ROUNDS), passwordChangedAt: now, updatedAt: now },
      $addToSet: { authProviders: "credentials" },
    }
  )
}

/** When the account's password last changed, or null (never changed, or no such account). */
export async function passwordChangedAt(email: string): Promise<Date | null> {
  const user = await (await users()).findOne({ email: normalizeEmail(email) }, { projection: { passwordChangedAt: 1 } })
  return user?.passwordChangedAt ?? null
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
  await (await users()).updateOne(
    { email },
    {
      $set: { updatedAt: now, ...(profile.name ? { name: profile.name } : {}), ...(profile.image ? { image: profile.image } : {}) },
      $setOnInsert: { email, createdAt: now, ...(profile.name ? {} : { name: "" }) },
      ...(provider ? { $addToSet: { authProviders: provider } } : {}),
    },
    { upsert: true }
  )
}
