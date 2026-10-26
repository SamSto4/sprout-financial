import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { hashResetToken } from "./reset.ts"
import {
  confirmEmail,
  existingAccountEmail,
  INVALID_VERIFY_LINK,
  sendVerification,
  startSignup,
  startSignupQuietly,
  UNVERIFIED_ACCOUNT_DAYS,
  verificationEmail,
  verificationRequired,
  verifyLink,
  type SignupAccount,
  type VerifyDeps,
  type VerifyEmail,
} from "./verify.ts"

const TOKEN = "a".repeat(43)
const NOW = new Date("2026-10-26T10:00:00Z")
const BASE = "https://sproutfinancial.co"

type Account = SignupAccount & { password?: string; unverifiedUntil?: Date }

/** In-memory stand-ins for MongoDB, Resend and the email limit. */
function fakeDeps(accounts: Account[] = [], { emailsAllowed = Infinity } = {}) {
  const tokens = new Map<string, { email: string; expiresAt: Date }>()
  const sent: VerifyEmail[] = []
  let emailCount = 0
  const deps: VerifyDeps = {
    async findAccount(email) {
      const account = accounts.find((row) => row.email === email)
      return account ? { email: account.email, hasPassword: account.hasPassword, verified: account.verified } : null
    },
    async createAccount(email, password, unverifiedUntil) {
      if (accounts.some((row) => row.email === email)) return false
      accounts.push({ email, hasPassword: true, verified: false, password, unverifiedUntil })
      return true
    },
    async saveToken({ tokenHash, email, expiresAt }) {
      tokens.set(tokenHash, { email, expiresAt })
    },
    async takeToken(tokenHash, now) {
      const row = tokens.get(tokenHash)
      tokens.delete(tokenHash)
      return row && row.expiresAt > now ? row.email : null
    },
    async deleteTokensFor(email) {
      for (const [hash, row] of tokens) if (row.email === email) tokens.delete(hash)
    },
    async markVerified(email) {
      const account = accounts.find((row) => row.email === email && !row.verified)
      if (!account) return false
      account.verified = true
      delete account.unverifiedUntil
      return true
    },
    async sendEmail(email) {
      sent.push(email)
    },
    async allowEmail() {
      return ++emailCount <= emailsAllowed
    },
    newToken: () => TOKEN,
    now: () => NOW,
  }
  return { deps, accounts, tokens, sent }
}

describe("verificationRequired", () => {
  it("is on in development, where the link is printed to the terminal", () => {
    assert.equal(verificationRequired({ NODE_ENV: "development" }), true)
  })
  it("is on in production only when email can reach anyone", () => {
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Sprout <hi@sprout.co>" }), true)
    // Resend's test sender only delivers to the Resend account's owner, so nobody else could confirm.
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }), false)
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "  " }), false)
    assert.equal(verificationRequired({ NODE_ENV: "production" }), false)
  })
})

describe("startSignup", () => {
  it("creates an unconfirmed account that expires, and emails a link with a token that's stored hashed", async () => {
    const { deps, accounts, tokens, sent } = fakeDeps()
    assert.equal(await startSignup("new@example.com", "correct horse", BASE, deps), "created")

    assert.equal(accounts.length, 1)
    assert.equal(accounts[0].verified, false)
    assert.equal(accounts[0].unverifiedUntil?.getTime(), NOW.getTime() + UNVERIFIED_ACCOUNT_DAYS * 86_400_000)

    assert.deepEqual([...tokens.keys()], [hashResetToken(TOKEN)])
    assert.equal(tokens.get(hashResetToken(TOKEN))?.expiresAt.getTime(), NOW.getTime() + 24 * 3_600_000)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, "new@example.com")
    assert.ok(sent[0].text.includes(verifyLink(BASE, TOKEN)))
  })

  it("doesn't touch an existing account; it emails its owner how to log in instead", async () => {
    const { deps, accounts, tokens, sent } = fakeDeps([{ email: "taken@example.com", hasPassword: true, verified: true, password: "theirs" }])
    assert.equal(await startSignup("taken@example.com", "attacker pw", BASE, deps), "exists-notified")
    assert.equal(accounts[0].password, "theirs")
    assert.equal(tokens.size, 0)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].subject, "You already have a Sprout account")
    assert.ok(sent[0].text.includes(`${BASE}/forgot-password`))
  })

  it("never sends a confirmation link for someone else's unconfirmed sign-up", async () => {
    // Otherwise the address's owner could confirm an account whose password a stranger chose.
    const { deps, tokens, sent } = fakeDeps([{ email: "pending@example.com", hasPassword: true, verified: false }])
    assert.equal(await startSignup("pending@example.com", "another pw", BASE, deps), "exists-notified")
    assert.equal(tokens.size, 0)
    assert.ok(!sent[0].text.includes("/verify-email"))
    assert.ok(sent[0].text.includes("hasn't been confirmed"))
  })

  it("tells a Google account's owner to use Google", async () => {
    const { deps, sent } = fakeDeps([{ email: "g@example.com", hasPassword: false, verified: true }])
    await startSignup("g@example.com", "pw pw pw pw", BASE, deps)
    assert.ok(sent[0].text.includes("Continue with Google"))
  })

  it("stops emailing an address once its limit is used up", async () => {
    const { deps, sent } = fakeDeps([{ email: "taken@example.com", hasPassword: true, verified: true }], { emailsAllowed: 0 })
    assert.equal(await startSignup("taken@example.com", "pw pw pw pw", BASE, deps), "exists-limited")
    assert.equal(sent.length, 0)

    const fresh = fakeDeps([], { emailsAllowed: 0 })
    assert.equal(await startSignup("new@example.com", "pw pw pw pw", BASE, fresh.deps), "created-limited")
    assert.equal(fresh.accounts.length, 1)
    assert.equal(fresh.sent.length, 0)
  })

  it("the quiet version never throws, so a failure can't show on the page", async () => {
    const { deps } = fakeDeps()
    deps.sendEmail = async () => {
      throw new Error("Resend is down")
    }
    assert.equal(await startSignupQuietly("new@example.com", "pw pw pw pw", BASE, deps), "failed")
  })
})

describe("confirmEmail", () => {
  it("confirms the account once, then the link stops working", async () => {
    const { deps, accounts } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    assert.deepEqual(await confirmEmail(TOKEN, deps), { ok: true, email: "new@example.com" })
    assert.equal(accounts[0].verified, true)
    assert.equal(accounts[0].unverifiedUntil, undefined)
    assert.deepEqual(await confirmEmail(TOKEN, deps), { ok: false, error: INVALID_VERIFY_LINK })
  })

  it("refuses expired links", async () => {
    const { deps, accounts } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    deps.now = () => new Date(NOW.getTime() + 25 * 3_600_000)
    assert.equal((await confirmEmail(TOKEN, deps)).ok, false)
    assert.equal(accounts[0].verified, false)
  })

  it("refuses malformed tokens without looking anything up", async () => {
    const { deps } = fakeDeps()
    deps.takeToken = async () => assert.fail("should not be called")
    for (const token of [undefined, "", "short", "a".repeat(44), "a".repeat(42) + "!", { $ne: null }]) {
      assert.deepEqual(await confirmEmail(token, deps), { ok: false, error: INVALID_VERIFY_LINK })
    }
  })

  it("fails when the account is gone (expired before the link was used)", async () => {
    const { deps, accounts } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    accounts.length = 0
    assert.equal((await confirmEmail(TOKEN, deps)).ok, false)
  })

  it("a new link replaces nothing: any unused link for the address works, and confirming clears the rest", async () => {
    const { deps, tokens } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    deps.newToken = () => "b".repeat(43)
    await sendVerification("new@example.com", BASE, deps)
    assert.equal(tokens.size, 2)
    assert.equal((await confirmEmail("b".repeat(43), deps)).ok, true)
    assert.equal(tokens.size, 0)
  })
})

describe("emails", () => {
  it("escape the link in HTML", () => {
    const email = verificationEmail("x@example.com", 'https://site/verify-email?token=a"><script>')
    assert.ok(!email.html.includes("<script>"))
  })
  it("existing-account emails escape the site address", () => {
    const email = existingAccountEmail("x@example.com", 'https://site"<b>', { hasPassword: true, verified: true })
    assert.ok(!email.html.includes('"<b>'))
  })
})
