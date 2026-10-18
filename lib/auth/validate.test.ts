import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MAX_PASSWORD_BYTES, passwordBytes, safeRedirect, signInErrorMessage, validateCredentials } from "./validate.ts"

describe("validateCredentials", () => {
  it("normalizes a valid email", () => {
    assert.deepEqual(validateCredentials("  Sam@Example.COM ", "correct horse"), {
      ok: true,
      email: "sam@example.com",
      password: "correct horse",
    })
  })

  it("rejects bad emails and short or missing passwords", () => {
    assert.equal(validateCredentials("not-an-email", "longenough").ok, false)
    assert.equal(validateCredentials("a@b.co", "short").ok, false)
    assert.equal(validateCredentials("a@b.co", null).ok, false)
    assert.equal(validateCredentials({ $gt: "" }, "longenough").ok, false)
  })

  it("caps new passwords at bcrypt's 72-byte limit", () => {
    assert.equal(validateCredentials("a@b.co", "x".repeat(MAX_PASSWORD_BYTES), "signup").ok, true)
    assert.equal(validateCredentials("a@b.co", "x".repeat(MAX_PASSWORD_BYTES + 1), "signup").ok, false)
  })

  it("counts bytes, not characters, so multi-byte passwords can't slip past the cap", () => {
    const accented = "é".repeat(40) // 40 characters, 80 bytes in UTF-8
    assert.equal(passwordBytes(accented), 80)
    assert.equal(validateCredentials("a@b.co", accented, "signup").ok, false)
  })

  it("still lets older, longer passwords log in", () => {
    assert.equal(validateCredentials("a@b.co", "x".repeat(150), "login").ok, true)
    assert.equal(validateCredentials("a@b.co", "x".repeat(201), "login").ok, false)
  })
})

describe("signInErrorMessage", () => {
  it("explains known codes and stays generic for the rest", () => {
    assert.match(signInErrorMessage("PasswordAccount") ?? "", /password account/)
    assert.match(signInErrorMessage("Configuration") ?? "", /Something went wrong/)
    assert.equal(signInErrorMessage(undefined), null)
    assert.equal(signInErrorMessage(""), null)
  })
})

describe("safeRedirect", () => {
  it("allows on-site paths only", () => {
    assert.equal(safeRedirect("/assistant?q=hi"), "/assistant?q=hi")
    assert.equal(safeRedirect("//evil.test"), "/")
    assert.equal(safeRedirect("/\\evil.test"), "/")
    assert.equal(safeRedirect("https://evil.test"), "/")
    assert.equal(safeRedirect(null), "/")
  })
})
