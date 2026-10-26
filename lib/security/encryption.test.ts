import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { describe, it } from "node:test"

import { decryptSecret, encryptSecret, needsReseal, parseKeyring } from "./encryption.ts"

const keyA = randomBytes(32).toString("base64")
const keyB = randomBytes(32).toString("base64")
const ring = parseKeyring({ DATA_ENCRYPTION_KEY: keyA })!

describe("parseKeyring", () => {
  it("needs a 32-byte base64 key", () => {
    assert.equal(parseKeyring({}), null)
    assert.equal(parseKeyring({ DATA_ENCRYPTION_KEY: "  " }), null)
    assert.equal(parseKeyring({ DATA_ENCRYPTION_KEY: randomBytes(16).toString("base64") }), null)
    assert.equal(parseKeyring({ DATA_ENCRYPTION_KEY: "not a key" }), null)
    assert.ok(parseKeyring({ DATA_ENCRYPTION_KEY: keyA }))
  })

  it("keeps the previous key for reading during a rotation", () => {
    const rotated = parseKeyring({ DATA_ENCRYPTION_KEY: keyB, DATA_ENCRYPTION_KEY_PREVIOUS: keyA })!
    assert.equal(rotated.byId.size, 2)
    assert.notEqual(rotated.current.id, ring.current.id)
  })
})

describe("encryptSecret and decryptSecret", () => {
  it("round-trips, with a different result each time", () => {
    const first = encryptSecret("JBSWY3DPEHPK3PXP", ring, "totp:a@example.com")
    const second = encryptSecret("JBSWY3DPEHPK3PXP", ring, "totp:a@example.com")
    assert.notEqual(first, second)
    assert.doesNotMatch(first, /JBSWY3DP/)
    assert.equal(decryptSecret(first, ring, "totp:a@example.com"), "JBSWY3DPEHPK3PXP")
  })

  it("refuses a value moved to another user's record", () => {
    const sealed = encryptSecret("secret", ring, "totp:a@example.com")
    assert.equal(decryptSecret(sealed, ring, "totp:b@example.com"), null)
  })

  it("refuses a value changed in storage", () => {
    const sealed = encryptSecret("secret", ring, "ctx")
    const parts = sealed.split(".")
    const body = Buffer.from(parts[4], "base64url")
    body[0] ^= 1
    parts[4] = body.toString("base64url")
    assert.equal(decryptSecret(parts.join("."), ring, "ctx"), null)
    assert.equal(decryptSecret("v1.garbage", ring, "ctx"), null)
    assert.equal(decryptSecret("", ring, "ctx"), null)
  })

  it("opens values sealed with the previous key after a rotation, and flags them for resealing", () => {
    const old = encryptSecret("secret", ring, "ctx")
    const rotated = parseKeyring({ DATA_ENCRYPTION_KEY: keyB, DATA_ENCRYPTION_KEY_PREVIOUS: keyA })!
    assert.equal(decryptSecret(old, rotated, "ctx"), "secret")
    assert.equal(needsReseal(old, rotated), true)
    assert.equal(needsReseal(encryptSecret("secret", rotated, "ctx"), rotated), false)
  })

  it("can't open values once their key is gone", () => {
    const old = encryptSecret("secret", ring, "ctx")
    assert.equal(decryptSecret(old, parseKeyring({ DATA_ENCRYPTION_KEY: keyB })!, "ctx"), null)
  })
})
