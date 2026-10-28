import "server-only"

import { MongoClient, type Db } from "mongodb"

import { onceWithRetry } from "@/lib/db/retry"

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

/**
 * Idempotent index setup, run once per server start. A failure is logged and tried again on the
 * first database call 5 minutes later, not on every call.
 */
const ensureIndexes = onceWithRetry(
  (db: Db) =>
    Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
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
      // Pending sign-ups (lib/auth/verify-server.ts): looked up by token hash, gone once expired.
      db.collection("email_verifications").createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection("email_verifications").createIndex({ email: 1 }),
      db.collection("email_verifications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      // Deleted-account records (lib/auth/users.ts): kept only until every older session has expired.
      db.collection("deleted_accounts").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      // Security activity (lib/auth/security-log-server.ts): read newest first per account, trimmed
      // per account and type, and gone after 90 days.
      db.collection("security_events").createIndex({ userEmail: 1, at: -1, _id: -1 }),
      db.collection("security_events").createIndex({ userEmail: 1, type: 1, at: -1, _id: -1 }),
      db.collection("security_events").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]),
  {
    coolDownMs: 5 * 60_000,
    onError: (error) => console.error("Failed to create indexes:", error instanceof Error ? error.message : error),
  }
)

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
