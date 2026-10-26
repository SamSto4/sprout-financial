import assert from "node:assert/strict"
import { test, describe } from "node:test"

import { hashResetToken } from "./reset.ts"
import {
  ALREADY_REGISTERED,
  confirmSignup,
  existingAccountEmail,
  INVALID_VERIFY_LINK,
  startSignup,
  startSignupQuietly,
  verificationEmail,
  verificationRequired,
  verifyLink,
  WRONG_SIGNUP_PASSWORD,
  type PendingSignup,
  type SignupAccount,
  type VerifyDeps,
  type VerifyEmail,
} from "./verify.ts"

const NOW = new Date("2026-10-26T10:00:00Z")
const BASE = "https://sproutfinancial.co"
const tokenOf = (letter: string) => letter.repeat(43)

type Account = SignupAccount & { passwordHash?: string }

/** In-memory stand-ins for MongoDB, bcrypt, Resend and the email limits. */
function fakeDeps(accounts: Account[] = [], { limit = "ok" as "ok" | "address" | "total" } = {}) {
  const pending: PendingSignup[] = []
  const sent: VerifyEmail[] = []
  const tokens = ["a", "b", "c", "d"].map(tokenOf)
  const deps: VerifyDeps = {
    async findAccount(email) {
      const account = accounts.find((row) => row.email === email)
      return account ? { email: account.email, hasPassword: account.hasPassword } : null
    },
    hashPassword: async (password) => `hashed:${password}`,
    checkPassword: async (password, hash) => hash === `hashed:${password}`,
    async savePending(record) {
      pending.push(record)
    },
    async findPending(tokenHash, now) {
      const row = pending.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > now)
      return row ? { email: row.email, passwordHash: row.passwordHash } : null
    },
    async deletePendingFor(email) {
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].email === email) pending.splice(i, 1)
    },
    async createAccount(email, passwordHash) {
      if (accounts.some((row) => row.email === email)) return false
      accounts.push({ email, hasPassword: true, passwordHash })
      return true
    },
    async sendEmail(email) {
      sent.push(email)
    },
    allowEmail: async () => limit,
    newToken: () => tokens.shift()!,
    now: () => NOW,
  }
  return { deps, accounts, pending, sent }
}

describe("verificationRequired", () => {
  test("is on in development, where the link is printed to the terminal", () => {
    assert.equal(verificationRequired({ NODE_ENV: "development" }), true)
  })
  test("is on in production only when email can reach anyone", () => {
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "Sprout <hi@sprout.co>" }), true)
    // Resend's test sender only delivers to the Resend account's owner, so nobody else could confirm.
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x" }), false)
    assert.equal(verificationRequired({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "  " }), false)
    assert.equal(verificationRequired({ NODE_ENV: "production" }), false)
  })
})

describe("startSignup", () => {
  test("creates no account: it saves a pending sign-up with a hashed token and password, and emails the link", async () => {
    const { deps, accounts, pending, sent } = fakeDeps()
    assert.equal(await startSignup("new@example.com", "correct horse", BASE, deps), "sent")

    assert.equal(accounts.length, 0)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].tokenHash, hashResetToken(tokenOf("a")))
    assert.equal(pending[0].passwordHash, "hashed:correct horse")
    assert.equal(pending[0].expiresAt.getTime(), NOW.getTime() + 24 * 3_600_000)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, "new@example.com")
    assert.ok(sent[0].text.includes(verifyLink(BASE, tokenOf("a"))))
  })

  test("doesn't touch an existing account; it emails its owner how to log in instead", async () => {
    const { deps, accounts, pending, sent } = fakeDeps([{ email: "taken@example.com", hasPassword: true, passwordHash: "theirs" }])
    assert.equal(await startSignup("taken@example.com", "attacker pw", BASE, deps), "exists-notified")
    assert.equal(accounts[0].passwordHash, "theirs")
    assert.equal(pending.length, 0)
    assert.equal(sent[0].subject, "You already have a Sprout account")
    assert.ok(!sent[0].text.includes("/verify-email"))
    assert.ok(sent[0].text.includes(`${BASE}/forgot-password`))
  })

  test("tells a Google account's owner to use Google", async () => {
    const { deps, sent } = fakeDeps([{ email: "g@example.com", hasPassword: false }])
    await startSignup("g@example.com", "pw pw pw pw", BASE, deps)
    assert.ok(sent[0].text.includes("Continue with Google"))
  })

  test("stops before hashing or emailing once a limit is used up, and says which limit", async () => {
    for (const limit of ["address", "total"] as const) {
      const { deps, pending, sent } = fakeDeps([], { limit })
      deps.hashPassword = async () => assert.fail("should not hash")
      assert.equal(await startSignup("new@example.com", "pw pw pw pw", BASE, deps), `limited-${limit}`)
      assert.equal(pending.length + sent.length, 0)
    }
  })

  test("the quiet version never throws, so a failure can't show on the page", async () => {
    const { deps } = fakeDeps()
    deps.sendEmail = async () => {
      throw new Error("Resend is down")
    }
    assert.equal(await startSignupQuietly("new@example.com", "pw pw pw pw", BASE, deps), "failed")
  })
})

describe("confirmSignup", () => {
  test("creates the account with the password chosen at sign-up, then the link stops working", async () => {
    const { deps, accounts, pending } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    assert.deepEqual(await confirmSignup(tokenOf("a"), "correct horse", deps), { ok: true, email: "new@example.com" })
    assert.deepEqual(accounts, [{ email: "new@example.com", hasPassword: true, passwordHash: "hashed:correct horse" }])
    assert.equal(pending.length, 0)
    assert.equal((await confirmSignup(tokenOf("a"), "correct horse", deps)).ok, false)
  })

  test("the inbox alone isn't enough: a stranger's sign-up can't be confirmed without the stranger's password", async () => {
    const { deps, accounts } = fakeDeps()
    await startSignup("victim@example.com", "stranger's pw", BASE, deps)
    // The victim opens the link that arrived in their inbox and types their own password.
    assert.deepEqual(await confirmSignup(tokenOf("a"), "victim's pw", deps), { ok: false, error: WRONG_SIGNUP_PASSWORD })
    assert.equal(accounts.length, 0)
  })

  test("a wrong password doesn't use up the link", async () => {
    const { deps } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    assert.equal((await confirmSignup(tokenOf("a"), "typo", deps)).ok, false)
    assert.equal((await confirmSignup(tokenOf("a"), "correct horse", deps)).ok, true)
  })

  test("each sign-up is separate; confirming one voids the others for that address", async () => {
    const { deps, accounts, pending } = fakeDeps()
    await startSignup("victim@example.com", "stranger's pw", BASE, deps) // token a
    await startSignup("victim@example.com", "victim's pw", BASE, deps) // token b
    assert.equal((await confirmSignup(tokenOf("b"), "victim's pw", deps)).ok, true)
    assert.equal(accounts[0].passwordHash, "hashed:victim's pw")
    assert.equal(pending.length, 0)
    assert.equal((await confirmSignup(tokenOf("a"), "stranger's pw", deps)).ok, false)
  })

  test("refuses when the address got an account in the meantime (e.g. with Google)", async () => {
    const { deps, accounts, pending } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    accounts.push({ email: "new@example.com", hasPassword: false })
    assert.deepEqual(await confirmSignup(tokenOf("a"), "correct horse", deps), {
      ok: false,
      error: ALREADY_REGISTERED,
      invalidLink: true,
    })
    assert.equal(accounts.length, 1)
    assert.equal(pending.length, 0)
  })

  test("refuses expired links", async () => {
    const { deps, accounts } = fakeDeps()
    await startSignup("new@example.com", "correct horse", BASE, deps)
    deps.now = () => new Date(NOW.getTime() + 25 * 3_600_000)
    assert.equal((await confirmSignup(tokenOf("a"), "correct horse", deps)).ok, false)
    assert.equal(accounts.length, 0)
  })

  test("refuses malformed tokens and passwords without looking anything up", async () => {
    const { deps } = fakeDeps()
    deps.findPending = async () => assert.fail("should not be called")
    for (const token of [undefined, "", "short", "a".repeat(44), "a".repeat(42) + "!", { $ne: null }]) {
      assert.deepEqual(await confirmSignup(token, "pw", deps), { ok: false, error: INVALID_VERIFY_LINK, invalidLink: true })
    }
    for (const password of [undefined, "", "x".repeat(201), { $ne: null }]) {
      assert.deepEqual(await confirmSignup(tokenOf("a"), password, deps), { ok: false, error: WRONG_SIGNUP_PASSWORD })
    }
  })
})

describe("emails", () => {
  test("escape the link in HTML", () => {
    const email = verificationEmail("x@example.com", 'https://site/verify-email?token=a"><script>')
    assert.ok(!email.html.includes("<script>"))
  })
  test("existing-account emails escape the site address", () => {
    const email = existingAccountEmail("x@example.com", 'https://site"<b>', { hasPassword: true })
    assert.ok(!email.html.includes('"<b>'))
  })
})
