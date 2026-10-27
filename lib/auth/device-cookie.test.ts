import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addDeviceToken,
  createDeviceToken,
  DEVICE_COOKIE_DAYS,
  deviceCookieName,
  isDeviceTokenCurrent,
  knownDeviceToken,
  MAX_DEVICE_TOKENS,
  readCookie,
} from "./device-cookie.ts"

const SECRET = "test-secret"
const NOW = Date.UTC(2026, 9, 27, 12, 0, 0)
const DAY = 86_400_000
const ID = "AbCdEfGhIjKlMnOpQrStUv"

/** The loginDevice counter key knownDeviceToken finds, or null. */
const deviceKey = (...args: Parameters<typeof knownDeviceToken>) => knownDeviceToken(...args)?.key ?? null

describe("knownDeviceToken", () => {
  it("recognizes a token issued to this browser for this account", () => {
    const token = createDeviceToken("sam@example.com", NOW, SECRET, ID)
    assert.equal(deviceKey(token, "sam@example.com", NOW + 60_000, SECRET), `device-${ID}`)
    // However the address is typed at login.
    assert.equal(deviceKey(token, "  Sam@Example.COM ", NOW, SECRET), `device-${ID}`)
  })

  it("doesn't let one account's cookie count for another", () => {
    const mine = createDeviceToken("attacker@example.com", NOW, SECRET, ID)
    assert.equal(deviceKey(mine, "victim@example.com", NOW, SECRET), null)
  })

  it("names no account", () => {
    const token = createDeviceToken("someone@example.com", NOW, SECRET)
    assert.doesNotMatch(token, /someone|example/)
    assert.match(token, /^d1\.[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{43}$/)
  })

  it("refuses tampered, foreign and malformed tokens", () => {
    const token = createDeviceToken("sam@example.com", NOW, SECRET, ID)
    const [version, id, issued, mac] = token.split(".")
    const flipped = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A")
    for (const bad of [
      `${version}.${id}.${issued}.${flipped}`,
      `${version}.${"B".repeat(22)}.${issued}.${mac}`,
      `${version}.${id}.${Number(issued) + 1}.${mac}`,
      `d2.${id}.${issued}.${mac}`,
      createDeviceToken("sam@example.com", NOW, "another-secret", ID),
      "",
      "garbage",
      "x".repeat(500),
      undefined,
      null,
      42,
    ]) {
      assert.equal(deviceKey(bad, "sam@example.com", NOW, SECRET), null, String(bad).slice(0, 40))
    }
  })

  it("expires, and allows a little clock skew", () => {
    const token = createDeviceToken("sam@example.com", NOW, SECRET, ID)
    assert.equal(deviceKey(token, "sam@example.com", NOW + (DEVICE_COOKIE_DAYS - 1) * DAY, SECRET), `device-${ID}`)
    assert.equal(deviceKey(token, "sam@example.com", NOW + (DEVICE_COOKIE_DAYS + 1) * DAY, SECRET), null)
    assert.equal(deviceKey(token, "sam@example.com", NOW - 60_000, SECRET), `device-${ID}`)
    assert.equal(deviceKey(token, "sam@example.com", NOW - 60 * 60_000, SECRET), null)
  })

  it("does nothing without a secret", () => {
    const token = createDeviceToken("sam@example.com", NOW, "", ID)
    assert.equal(deviceKey(token, "sam@example.com", NOW, ""), null)
    assert.equal(addDeviceToken(null, "sam@example.com", NOW, ""), null)
  })
})

describe("addDeviceToken", () => {
  it("remembers several accounts on one browser, newest first", () => {
    let cookie = addDeviceToken(null, "a@example.com", NOW, SECRET)
    cookie = addDeviceToken(cookie, "b@example.com", NOW + 1000, SECRET)
    assert.ok(cookie)
    assert.ok(deviceKey(cookie, "a@example.com", NOW + 2000, SECRET))
    assert.ok(deviceKey(cookie, "b@example.com", NOW + 2000, SECRET))
    assert.equal(cookie.split("~").length, 2)
  })

  it("replaces this account's old token instead of adding another", () => {
    const first = addDeviceToken(null, "a@example.com", NOW, SECRET, ID)
    const second = addDeviceToken(first, "a@example.com", NOW + DAY, SECRET)
    assert.ok(second)
    assert.equal(second.split("~").length, 1)
    assert.notEqual(deviceKey(second, "a@example.com", NOW + DAY, SECRET), `device-${ID}`)
  })

  it(`keeps at most ${MAX_DEVICE_TOKENS} and drops expired or unreadable ones`, () => {
    let cookie: string | null = "junk~d1.bad"
    for (let i = 0; i < 6; i++) cookie = addDeviceToken(cookie, `user${i}@example.com`, NOW + i, SECRET)
    assert.ok(cookie)
    assert.equal(cookie.split("~").length, MAX_DEVICE_TOKENS)
    assert.ok(deviceKey(cookie, "user5@example.com", NOW + 10, SECRET))
    assert.equal(deviceKey(cookie, "user0@example.com", NOW + 10, SECRET), null)
    const old = createDeviceToken("old@example.com", NOW - (DEVICE_COOKIE_DAYS + 1) * DAY, SECRET)
    assert.equal(addDeviceToken(old, "new@example.com", NOW, SECRET)?.split("~").length, 1)
  })

  it("stays a valid cookie value of a few hundred bytes", () => {
    let cookie: string | null = null
    for (let i = 0; i < MAX_DEVICE_TOKENS; i++) cookie = addDeviceToken(cookie, `user${i}@example.com`, NOW, SECRET)
    assert.ok(cookie && cookie.length <= 400)
    // Cookie-safe characters only: nothing a browser or encodeURIComponent would change.
    assert.match(cookie, /^[A-Za-z0-9._~-]+$/)
  })
})

describe("device tokens after the account's sessions end", () => {
  const resetAt = new Date(NOW + DAY + 500)

  it("gives the token's issue time with its key", () => {
    const token = createDeviceToken("sam@example.com", NOW + 999, SECRET, ID)
    assert.deepEqual(knownDeviceToken(token, "sam@example.com", NOW + 60_000, SECRET), { key: `device-${ID}`, issuedAt: NOW / 1000 })
    assert.equal(knownDeviceToken(token, "other@example.com", NOW, SECRET), null)
  })

  it("stops counting a token issued before a password reset, Sign out everywhere or a deletion", () => {
    // An intruder's token from while they were logged in: from now on their logins use the account's limit.
    const intruder = knownDeviceToken(createDeviceToken("sam@example.com", NOW, SECRET, ID), "sam@example.com", NOW + 2 * DAY, SECRET)
    assert.ok(intruder)
    assert.equal(isDeviceTokenCurrent(intruder.issuedAt, resetAt), false)
    assert.equal(isDeviceTokenCurrent(intruder.issuedAt, new Date(resetAt.getTime() - DAY)), true)
  })

  it("keeps counting the token the owner's browser gets right after the reset, even in the same second", () => {
    const sameSecond = knownDeviceToken(createDeviceToken("sam@example.com", resetAt.getTime() + 300, SECRET, ID), "sam@example.com", NOW + 2 * DAY, SECRET)
    const later = knownDeviceToken(createDeviceToken("sam@example.com", resetAt.getTime() + 5_000, SECRET, ID), "sam@example.com", NOW + 2 * DAY, SECRET)
    assert.ok(sameSecond && later)
    assert.equal(isDeviceTokenCurrent(sameSecond.issuedAt, resetAt), true)
    assert.equal(isDeviceTokenCurrent(later.issuedAt, resetAt), true)
    assert.equal(isDeviceTokenCurrent(sameSecond.issuedAt - 1, resetAt), false)
  })

  it("counts every valid token when the account's sessions never ended", () => {
    assert.equal(isDeviceTokenCurrent(NOW / 1000, null), true)
    assert.equal(isDeviceTokenCurrent(NOW / 1000, undefined), true)
    assert.equal(isDeviceTokenCurrent(Number.NaN, null), false)
  })
})

describe("readCookie", () => {
  it("finds one cookie in a Cookie header", () => {
    assert.equal(readCookie("a=1; sprout-device=d1.x; b=2", "sprout-device"), "d1.x")
    assert.equal(readCookie("sprout-device=", "sprout-device"), "")
    assert.equal(readCookie("other-sprout-device=1", "sprout-device"), null)
    assert.equal(readCookie(null, "sprout-device"), null)
    assert.equal(readCookie("", "sprout-device"), null)
  })
})

describe("deviceCookieName", () => {
  it("uses the __Host- prefix when served over HTTPS", () => {
    assert.equal(deviceCookieName(true), "__Host-sprout-device")
    assert.equal(deviceCookieName(false), "sprout-device")
  })
})
