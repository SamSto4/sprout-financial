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

  it("never returns an inherited property for a crafted code", () => {
    // /login?error=toString used to return Object.prototype.toString, which crashed the page.
    for (const code of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf", "isPrototypeOf"]) {
      const message = signInErrorMessage(code)
      assert.equal(typeof message, "string", code)
      assert.equal(message, "Something went wrong signing you in. Please try again.", code)
    }
    assert.equal(signInErrorMessage("AccessDenied"), "That sign-in couldn't be completed. Try again, or log in with your email and password.")
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

  it("refuses paths that browsers turn into another site by dropping tabs and newlines", () => {
    // Each of these parses to https://evil.test/ in a browser.
    for (const attack of ["/\t/evil.test", "/\n/evil.test", "/\r\n/evil.test", "/\t\\evil.test", "/\u0000/evil.test"]) {
      assert.equal(safeRedirect(attack), "/", JSON.stringify(attack))
      assert.equal(new URL(safeRedirect(attack), "https://sprout.test").origin, "https://sprout.test")
    }
  })

  it("refuses backslashes anywhere and absurdly long values", () => {
    assert.equal(safeRedirect("/learn\\..\\evil"), "/")
    assert.equal(safeRedirect(`/${"a".repeat(3000)}`), "/")
  })

  it("keeps ordinary on-site destinations exactly as given", () => {
    for (const path of ["/", "/dashboard", "/learn/why-invest", "/assistant?q=index%20funds&mode=deep-research", "/plan#goals", "/ /x"]) {
      assert.equal(safeRedirect(path), path)
    }
  })
})
