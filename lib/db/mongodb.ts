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
  globalForMongo.__mongoClient ??= MongoClient.connect(uri, { maxPoolSize: 10 }).catch((error: unknown) => {
    globalForMongo.__mongoClient = undefined
    throw error
  })
  const client = await globalForMongo.__mongoClient
  const db = client.db(process.env.MONGODB_DB || "financial-literacy")
  await ensureIndexes(db)
  return db
}
