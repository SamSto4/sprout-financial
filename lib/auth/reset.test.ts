import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  finishPasswordReset,
  hashResetToken,
  INVALID_LINK,
  isResetTokenShape,
  newResetToken,
  resetLink,
  siteUrl,
  startPasswordReset,
  startPasswordResetQuietly,
  validateNewPassword,
  type ResetDeps,
  type ResetEmail,
} from "./reset.ts"

function fakeDeps(accounts: Record<string, { hasPassword: boolean }>, start = new Date("2026-01-01T00:00:00Z")) {
  const tokens = new Map<string, { email: string; expiresAt: Date }>()
  const sent: ResetEmail[] = []
  const passwords = new Map<string, string>()
  let clock = start
  let counter = 0
  const deps: ResetDeps = {
    async findAccount(email) {
      const account = accounts[email]
      return account ? { email, hasPassword: account.hasPassword } : null
    },
    async saveToken({ tokenHash, email, expiresAt }) {
      tokens.set(tokenHash, { email, expiresAt })
    },
    async takeToken(tokenHash, now) {
      const record = tokens.get(tokenHash)
      tokens.delete(tokenHash)
      return record && record.expiresAt > now ? record.email : null
    },
    async deleteTokensFor(email) {
      for (const [hash, record] of tokens) if (record.email === email) tokens.delete(hash)
    },
    async setPassword(email, password) {
      passwords.set(email, password)
    },
    async sendEmail(email) {
      sent.push(email)
    },
    newToken: () => `${"a".repeat(42)}${counter++}`,
    now: () => clock,
  }
  return { deps, tokens, sent, passwords, advance: (minutes: number) => (clock = new Date(clock.getTime() + minutes * 60_000)) }
}

const BASE = "https://sprout.test"

describe("reset tokens", () => {
  it("are URL-safe, 43 characters and unique", () => {
    const a = newResetToken()
    const b = newResetToken()
    assert.ok(isResetTokenShape(a))
    assert.notEqual(a, b)
  })

  it("are stored only as a hash", () => {
    const token = newResetToken()
    assert.match(hashResetToken(token), /^[0-9a-f]{64}$/)
    assert.notEqual(hashResetToken(token), token)
  })

  it("rejects malformed tokens", () => {
    assert.equal(isResetTokenShape("short"), false)
    assert.equal(isResetTokenShape({ $ne: null }), false)
    assert.equal(isResetTokenShape(`${"a".repeat(42)}$`), false)
  })
})

describe("siteUrl", () => {
  it("prefers SITE_URL and drops a trailing slash", () => {
    assert.equal(siteUrl({ SITE_URL: "https://sprout.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }), "https://sprout.example")
  })
  it("ignores a SITE_URL with a path or junk", () => {
    assert.equal(siteUrl({ SITE_URL: "https://evil.test/phish", VERCEL_PROJECT_PRODUCTION_URL: "sprout.vercel.app" }), "https://sprout.vercel.app")
  })
  it("uses the preview address on preview deployments", () => {
    assert.equal(
      siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "sprout-abc.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "sprout.vercel.app" }),
      "https://sprout-abc.vercel.app"
    )
  })
  it("falls back to localhost", () => {
    assert.equal(siteUrl({}), "http://localhost:3000")
  })
  it("builds the reset link", () => {
    assert.equal(resetLink(BASE, "abc"), "https://sprout.test/reset-password?token=abc")
  })
})

describe("validateNewPassword", () => {
  it("needs 8 characters, at most 72 bytes, and a matching confirmation", () => {
    assert.equal(validateNewPassword("short", "short").ok, false)
    assert.equal(validateNewPassword("x".repeat(73), "x".repeat(73)).ok, false)
    assert.deepEqual(validateNewPassword("long enough", "long enoug"), { ok: false, error: "The two passwords don't match." })
    assert.deepEqual(validateNewPassword("long enough", "long enough"), { ok: true, password: "long enough" })
  })
})

describe("startPasswordReset", () => {
  it("emails a link for a password account and stores only the hash", async () => {
    const { deps, tokens, sent } = fakeDeps({ "sam@example.com": { hasPassword: true } })
    assert.equal(await startPasswordReset("sam@example.com", BASE, deps), "sent")
    assert.equal(sent.length, 1)
    const token = `${"a".repeat(42)}0`
    assert.ok(sent[0].text.includes(resetLink(BASE, token)))
    assert.ok(tokens.has(hashResetToken(token)))
    assert.ok(![...tokens.keys()].includes(token))
  })

  it("sends nothing for an unknown email", async () => {
    const { deps, sent } = fakeDeps({})
    assert.equal(await startPasswordReset("nobody@example.com", BASE, deps), "no-account")
    assert.equal(sent.length, 0)
  })

  it("tells a Google-only account to use Google instead of creating a token", async () => {
    const { deps, sent, tokens } = fakeDeps({ "g@example.com": { hasPassword: false } })
    assert.equal(await startPasswordReset("g@example.com", BASE, deps), "google-only")
    assert.equal(tokens.size, 0)
    assert.match(sent[0].text, /Continue with Google/)
  })

  it("escapes the link in the HTML email", async () => {
    const { deps, sent } = fakeDeps({ "sam@example.com": { hasPassword: true } })
    await startPasswordReset("sam@example.com", 'https://x.test"><script>', deps)
    assert.ok(!sent[0].html.includes("<script>"))
  })
})

describe("startPasswordResetQuietly", () => {
  it("never throws when the email can't be sent, so the visitor's reply can't differ", async () => {
    const { deps } = fakeDeps({ "sam@example.com": { hasPassword: true } })
    const failing: ResetDeps = { ...deps, sendEmail: async () => Promise.reject(new Error("Resend is down")) }
    assert.equal(await startPasswordResetQuietly("sam@example.com", BASE, failing), "failed")
    assert.equal(await startPasswordResetQuietly("nobody@example.com", BASE, failing), "no-account")
  })

  it("or when the database lookup fails", async () => {
    const { deps } = fakeDeps({})
    const failing: ResetDeps = { ...deps, findAccount: async () => Promise.reject(new Error("timeout")) }
    assert.equal(await startPasswordResetQuietly("sam@example.com", BASE, failing), "failed")
  })
})

describe("finishPasswordReset", () => {
  async function requested() {
    const fake = fakeDeps({ "sam@example.com": { hasPassword: true } })
    await startPasswordReset("sam@example.com", BASE, fake.deps)
    return { ...fake, token: `${"a".repeat(42)}0` }
  }

  it("sets the new password and the link then stops working", async () => {
    const { deps, passwords, token } = await requested()
    assert.deepEqual(await finishPasswordReset(token, "new password", "new password", deps), { ok: true, email: "sam@example.com" })
    assert.equal(passwords.get("sam@example.com"), "new password")
    assert.deepEqual(await finishPasswordReset(token, "another one", "another one", deps), { ok: false, error: INVALID_LINK })
  })

  it("rejects an expired link", async () => {
    const { deps, passwords, token, advance } = await requested()
    advance(61)
    assert.deepEqual(await finishPasswordReset(token, "new password", "new password", deps), { ok: false, error: INVALID_LINK })
    assert.equal(passwords.size, 0)
  })

  it("keeps the link usable when the passwords don't match", async () => {
    const { deps, token } = await requested()
    assert.equal((await finishPasswordReset(token, "new password", "typo", deps)).ok, false)
    assert.equal((await finishPasswordReset(token, "new password", "new password", deps)).ok, true)
  })

  it("invalidates other outstanding links for the same account", async () => {
    const { deps, token } = await requested()
    await startPasswordReset("sam@example.com", BASE, deps)
    const second = `${"a".repeat(42)}1`
    assert.equal((await finishPasswordReset(token, "new password", "new password", deps)).ok, true)
    assert.equal((await finishPasswordReset(second, "new password", "new password", deps)).ok, false)
  })

  it("rejects a malformed token without touching storage", async () => {
    const { deps } = fakeDeps({})
    assert.deepEqual(await finishPasswordReset({ $gt: "" }, "new password", "new password", deps), { ok: false, error: INVALID_LINK })
  })
})
