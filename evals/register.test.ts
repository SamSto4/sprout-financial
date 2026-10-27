import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

describe("the eval loader (evals/register.mjs)", () => {
  it("keeps app code off the database named in .env, so eval runs never add to the live spending total", () => {
    // The same flags as the eval scripts, with a database configured as a production .env would.
    const script = 'import("@/lib/db/mongodb").then((db) => console.log(JSON.stringify({ configured: db.isDatabaseConfigured(), uri: process.env.MONGODB_URI ?? null, alt: process.env.MONGO_DB_URI ?? null })))'
    const output = execFileSync(process.execPath, ["--import", "./evals/register.mjs", "--input-type=module", "-e", script], {
      cwd: root,
      env: { ...process.env, MONGODB_URI: "mongodb://production.invalid/db", MONGO_DB_URI: "mongodb://production.invalid/db" },
      encoding: "utf8",
    })
    assert.deepEqual(JSON.parse(output.trim().split("\n").at(-1) ?? ""), { configured: false, uri: null, alt: null })
  })
})
