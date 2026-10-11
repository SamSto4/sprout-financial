import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { safeRedirect, validateCredentials } from "./validate.ts"

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
