import "server-only"

import { MongoClient, type Db } from "mongodb"

// One client per server process. Dev hot reloads re-run this module, so the connection is kept
// on globalThis instead of a module variable.
const globalForMongo = globalThis as typeof globalThis & { __mongoClient?: Promise<MongoClient> }

/** The connection string. MONGO_DB_URI is accepted as an alternative name. */
function connectionString() {
  return process.env.MONGODB_URI || process.env.MONGO_DB_URI
}

export function isDatabaseConfigured() {
  return Boolean(connectionString())
}

let indexes: Promise<void> | null = null

/** Idempotent index setup, run once per server start. A failure is logged and retried next time. */
function ensureIndexes(db: Db) {
  indexes ??= Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    // Unconfirmed sign-ups (lib/auth/verify.ts) delete themselves; confirmed accounts don't have the field.
    db.collection("users").createIndex({ unverifiedExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("chats").createIndex({ userEmail: 1, chatId: 1 }, { unique: true }),
    db.collection("chats").createIndex({ userEmail: 1, updatedAt: -1 }),
    db.collection("user_data").createIndex({ userEmail: 1, key: 1 }, { unique: true }),
    // Rate-limit counters (lib/rate-limit/server.ts) remove themselves when their window ends.
    db.collection("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    // Monthly spending totals (lib/ai/spend-server.ts) are dropped once their month is over.
    db.collection("spending").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    // Password reset tokens (lib/auth/reset-server.ts): looked up by hash, gone once expired.
    db.collection("password_resets").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("password_resets").createIndex({ email: 1 }),
    db.collection("password_resets").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    // Email confirmation tokens (lib/auth/verify-server.ts): same shape and rules as reset tokens.
    db.collection("email_verifications").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("email_verifications").createIndex({ email: 1 }),
    db.collection("email_verifications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    // Deleted-account records (lib/auth/users.ts): kept only until every older session has expired.
    db.collection("deleted_accounts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
    .then(() => undefined)
    .catch((error: unknown) => {
      indexes = null
      console.error("Failed to create indexes:", error instanceof Error ? error.message : error)
    })
  return indexes
}

export async function getDb(): Promise<Db> {
  const uri = connectionString()
  if (!uri) throw new Error("MONGODB_URI (or MONGO_DB_URI) is not set")

  // A small pool: serverless hosts run many instances against one cluster.
  // Fail within seconds when the database can't be reached (for example, the host's IP isn't on
  // MongoDB Atlas's Network Access list), instead of the driver's 30-second default leaving forms
  // spinning and serverless functions running until they time out.
  globalForMongo.__mongoClient ??= MongoClient.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  }).catch((error: unknown) => {
    globalForMongo.__mongoClient = undefined
    throw error
  })
  const client = await globalForMongo.__mongoClient
  const db = client.db(process.env.MONGODB_DB || "financial-literacy")
  await ensureIndexes(db)
  return db
}
