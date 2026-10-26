// Two-step verification codes: the 6-digit codes authenticator apps (Google Authenticator,
// 1Password, Authy...) show, as defined by RFC 6238 (TOTP), and the one-time recovery codes for
// when the phone is lost. Pure, apart from random bytes, and tested against the RFC's vectors.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const PERIOD_SECONDS = 30
const DIGITS = 6
// Codes from one step either side of now are accepted, so a phone clock 30 seconds off still works.
const ALLOWED_DRIFT = 1
const SECRET_BYTES = 20

export const RECOVERY_CODE_COUNT = 10
// 16 characters from a 32-letter alphabet: 80 random bits, far beyond guessing even if the stored
// hashes leaked, which is why a plain SHA-256 is enough to store them.
const RECOVERY_CODE_LENGTH = 16

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

/** Decodes base32, ignoring spaces, dashes, padding and case. Null on any other character. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "")
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** The HOTP value for one counter (RFC 4226), as a zero-padded string. */
export function hotp(secret: Buffer, counter: number, digits: number = DIGITS): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", secret).update(message).digest()
  const offset = digest[digest.length - 1] & 15
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** digits).padStart(digits, "0")
}

/** Which 30-second step a moment falls in. */
export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / PERIOD_SECONDS)
}

/**
 * Checks a 6-digit code against the secret. Returns the step it matched, or null. A step at or
 * before `lastUsedStep` is refused, so a code seen over someone's shoulder can't be used again.
 */
export function verifyTotp(secret: Buffer, code: string, nowMs: number, lastUsedStep: number | null): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const now = totpStep(nowMs)
  for (let step = now - ALLOWED_DRIFT; step <= now + ALLOWED_DRIFT; step++) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) return step
  }
  return null
}

/** A new random secret, base32, as authenticator apps expect. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES))
}

/** The link an authenticator app reads from the QR code. */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD_SECONDS) })
  return `otpauth://totp/${label}?${params}`
}

/** The secret in groups of four, for typing into an app by hand. */
export function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret
}

/** New recovery codes, shown once, like "k7m2-x9qp-3nfa-b2c4". Only their hashes are stored. */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(10)).slice(0, RECOVERY_CODE_LENGTH).toLowerCase()
    return raw.match(/.{4}/g)!.join("-")
  })
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

/**
 * What a person typed into the code box: an authenticator code (spaces allowed, "123 456"), or a
 * recovery code (dashes, spaces and case don't matter). Null for anything else.
 */
export function readSecondFactor(input: string): { kind: "totp"; code: string } | { kind: "recovery"; code: string } | null {
  const compact = input.replace(/[\s-]/g, "").toLowerCase()
  if (/^\d{6}$/.test(compact)) return { kind: "totp", code: compact }
  if (compact.length === RECOVERY_CODE_LENGTH && /^[a-z2-7]+$/.test(compact)) {
    return { kind: "recovery", code: compact.match(/.{4}/g)!.join("-") }
  }
  return null
}
