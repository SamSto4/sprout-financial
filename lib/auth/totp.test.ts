import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  base32Decode,
  base32Encode,
  formatSecret,
  hashRecoveryCode,
  hotp,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  readSecondFactor,
  RECOVERY_CODE_COUNT,
  totpStep,
  verifyTotp,
} from "./totp.ts"

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890")
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
]

describe("hotp and totpStep", () => {
  it("match the RFC 6238 test vectors", () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      assert.equal(hotp(RFC_SECRET, totpStep(seconds * 1000), 8), expected, `at ${seconds}s`)
    }
  })

  it("give 6 digits by default, the last six of the 8-digit value", () => {
    assert.equal(hotp(RFC_SECRET, totpStep(59_000)), "287082")
  })
})

describe("base32", () => {
  it("round-trips and matches RFC 4648", () => {
    assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI")
    assert.equal(base32Decode("MZXW6YTBOI")!.toString(), "foobar")
    assert.equal(base32Decode("mzxw 6ytb-oi====")!.toString(), "foobar")
    assert.equal(base32Decode("MZXW1"), null)
  })

  it("makes 160-bit secrets apps accept", () => {
    const secret = newTotpSecret()
    assert.match(secret, /^[A-Z2-7]{32}$/)
    assert.equal(base32Decode(secret)!.length, 20)
    assert.notEqual(secret, newTotpSecret())
  })
})

describe("verifyTotp", () => {
  const now = 1_800_000_000_000
  const step = totpStep(now)

  it("accepts the current code and the ones either side, returning the step", () => {
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), now, null), step)
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now, null), step - 1)
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now, null), step + 1)
  })

  it("refuses codes from further away, malformed input, and a step already used", () => {
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), now, null), null)
    assert.equal(verifyTotp(RFC_SECRET, "12345", now, null), null)
    assert.equal(verifyTotp(RFC_SECRET, "abcdef", now, null), null)
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), now, step), null, "replayed")
    assert.equal(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now, step), step + 1, "the next one is fine")
  })
})

describe("otpauthUri and formatSecret", () => {
  it("builds the link authenticator apps read", () => {
    const uri = otpauthUri("Sprout", "sam@example.com", "JBSWY3DPEHPK3PXP")
    assert.equal(uri, "otpauth://totp/Sprout%3Asam%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Sprout&algorithm=SHA1&digits=6&period=30")
    assert.equal(formatSecret("JBSWY3DPEHPK3PXP"), "JBSW Y3DP EHPK 3PXP")
  })
})

describe("recovery codes", () => {
  it("makes ten different codes in a readable shape", () => {
    const codes = newRecoveryCodes()
    assert.equal(codes.length, RECOVERY_CODE_COUNT)
    assert.equal(new Set(codes).size, RECOVERY_CODE_COUNT)
    for (const code of codes) assert.match(code, /^[a-z2-7]{4}-[a-z2-7]{4}-[a-z2-7]{4}-[a-z2-7]{4}$/)
  })

  it("hashes the normalized form, so how it was typed doesn't matter", () => {
    const [code] = newRecoveryCodes()
    const typed = readSecondFactor(` ${code.toUpperCase().replace(/-/g, " ")} `)
    assert.deepEqual(typed, { kind: "recovery", code })
    assert.equal(hashRecoveryCode(typed!.code), hashRecoveryCode(code))
  })
})

describe("readSecondFactor", () => {
  it("tells authenticator codes from recovery codes, and refuses the rest", () => {
    assert.deepEqual(readSecondFactor("123 456"), { kind: "totp", code: "123456" })
    assert.deepEqual(readSecondFactor("abcd-efgh-ijkl-mn23"), { kind: "recovery", code: "abcd-efgh-ijkl-mn23" })
    assert.equal(readSecondFactor("12345"), null)
    assert.equal(readSecondFactor("abcd-efgh-ijkl-mn01"), null, "0 and 1 aren't in the alphabet")
    assert.equal(readSecondFactor(""), null)
  })
})
