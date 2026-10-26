// Encrypts secrets before they're stored in MongoDB: two-step verification keys now, bank
// connection tokens later. MongoDB Atlas encrypts its disks, but that doesn't help if the database
// itself is read (a leaked connection string, a stolen backup). With this, the database alone
// isn't enough: the key lives only in the server's environment (DATA_ENCRYPTION_KEY).
//
// AES-256-GCM from Node's built-in crypto: it hides the secret and detects any change to the
// stored value. Each value is bound to a context such as "totp:you@example.com", so one user's
// secret copied onto another user's record won't decrypt. Kept free of framework imports so it
// can be unit-tested with `node --test`.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const VERSION = "v1"
const KEY_BYTES = 32
const IV_BYTES = 12

/**
 * The keys this server can use. New values are always sealed with `current`; `byId` also holds
 * the previous key during a rotation, so values sealed before it still open.
 */
export type Keyring = { current: { id: string; key: Buffer }; byId: Map<string, Buffer> }

/** A short, public fingerprint of a key, stored with each value so decryption picks the right key. */
function keyId(key: Buffer) {
  return createHash("sha256").update(key).digest("hex").slice(0, 8)
}

function decodeKey(text: string | undefined): Buffer | null {
  if (!text?.trim()) return null
  const key = Buffer.from(text.trim(), "base64")
  return key.length === KEY_BYTES ? key : null
}

/**
 * Reads DATA_ENCRYPTION_KEY (and DATA_ENCRYPTION_KEY_PREVIOUS during a rotation): 32 random bytes,
 * base64, from `openssl rand -base64 32`. Null when the current key is missing or malformed, so
 * features that store secrets switch off instead of storing them unprotected.
 */
export function parseKeyring(env: { DATA_ENCRYPTION_KEY?: string; DATA_ENCRYPTION_KEY_PREVIOUS?: string }): Keyring | null {
  const current = decodeKey(env.DATA_ENCRYPTION_KEY)
  if (!current) return null
  const byId = new Map([[keyId(current), current]])
  const previous = decodeKey(env.DATA_ENCRYPTION_KEY_PREVIOUS)
  if (previous) byId.set(keyId(previous), previous)
  return { current: { id: keyId(current), key: current }, byId }
}

/** Seals `plaintext` for storage as "v1.<key id>.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plaintext: string, keyring: Keyring, context: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", keyring.current.key, iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return [VERSION, keyring.current.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".")
}

/**
 * Opens a value sealed by encryptSecret. Null when it was sealed with a key this server no longer
 * has, for another context, or was changed in any way. Never throws.
 */
export function decryptSecret(sealed: string, keyring: Keyring, context: string): string | null {
  const parts = sealed.split(".")
  if (parts.length !== 5 || parts[0] !== VERSION) return null
  const key = keyring.byId.get(parts[1])
  if (!key) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[2], "base64url"))
    decipher.setAAD(Buffer.from(context, "utf8"))
    decipher.setAuthTag(Buffer.from(parts[3], "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** True when a value was sealed with an older key and should be sealed again with the current one. */
export function needsReseal(sealed: string, keyring: Keyring): boolean {
  return sealed.split(".")[1] !== keyring.current.id
}
