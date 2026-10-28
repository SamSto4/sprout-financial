import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { HISTORY_LOOKUPS, MARKET_LINEUP } from "../market/history.ts"
import {
  accountKey,
  addressKey,
  checkLimits,
  clientAddress,
  createMemoryStore,
  DEFAULT_DAILY_TOTAL,
  limitMessage,
  normalizeAddress,
  parseDailyTotal,
  policies,
  twoFactorLoginKey,
  visitorKey,
  type Limit,
} from "./limits.ts"

const MINUTE = 60_000
// A time that sits exactly on a 10-minute and a 1-day boundary, so window math is easy to read.
const START = Date.UTC(2026, 9, 11)

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })

describe("checkLimits", () => {
  const burst: Limit = { name: "burst", scope: "client", max: 3, windowSeconds: 600 }

  it("allows up to the maximum, then blocks until the window ends", async () => {
    const store = createMemoryStore(() => START)
    for (let i = 0; i < 3; i++) assert.deepEqual(await checkLimits(store, "1.1.1.1", [burst], START), { allowed: true })
    assert.deepEqual(await checkLimits(store, "1.1.1.1", [burst], START + 4 * MINUTE), {
      allowed: false,
      scope: "client",
      retryAfterSeconds: 360,
    })
  })

  it("starts fresh in the next window", async () => {
    let time = START
    const store = createMemoryStore(() => time)
    for (let i = 0; i < 4; i++) await checkLimits(store, "1.1.1.1", [burst], time)
    time = START + 10 * MINUTE
    assert.deepEqual(await checkLimits(store, "1.1.1.1", [burst], time), { allowed: true })
  })

  it("counts each client separately", async () => {
    const store = createMemoryStore(() => START)
    for (let i = 0; i < 4; i++) await checkLimits(store, "1.1.1.1", [burst], START)
    assert.deepEqual(await checkLimits(store, "2.2.2.2", [burst], START), { allowed: true })
  })

  it("shares an 'everyone' limit across clients", async () => {
    const total: Limit = { name: "total", scope: "everyone", max: 2, windowSeconds: 86_400 }
    const store = createMemoryStore(() => START)
    assert.equal((await checkLimits(store, "1.1.1.1", [total], START)).allowed, true)
    assert.equal((await checkLimits(store, "2.2.2.2", [total], START)).allowed, true)
    assert.deepEqual(await checkLimits(store, "3.3.3.3", [total], START + 6 * 60 * MINUTE), {
      allowed: false,
      scope: "everyone",
      retryAfterSeconds: 18 * 60 * 60,
    })
  })

  it("doesn't spend the shared total on a client who is already blocked", async () => {
    const total: Limit = { name: "total", scope: "everyone", max: 5, windowSeconds: 86_400 }
    const store = createMemoryStore(() => START)
    // Ten attempts from one client: three pass, seven are stopped by the burst limit first.
    for (let i = 0; i < 10; i++) await checkLimits(store, "1.1.1.1", [burst, total], START)
    // So only three of the five shared slots are used, and two other visitors still get through.
    assert.equal((await checkLimits(store, "2.2.2.2", [burst, total], START)).allowed, true)
    assert.equal((await checkLimits(store, "3.3.3.3", [burst, total], START)).allowed, true)
    assert.equal((await checkLimits(store, "4.4.4.4", [burst, total], START)).allowed, false)
  })

  it("never reports a wait shorter than a second", async () => {
    const store = createMemoryStore(() => START)
    for (let i = 0; i < 3; i++) await checkLimits(store, "1.1.1.1", [burst], START)
    const decision = await checkLimits(store, "1.1.1.1", [burst], START + 10 * MINUTE - 1)
    assert.deepEqual(decision, { allowed: false, scope: "client", retryAfterSeconds: 1 })
  })
})

describe("weighted requests", () => {
  it("count each unit, so one big request can use up the limit", async () => {
    const store = createMemoryStore(() => START)
    const limit = { name: "market", scope: "client", max: 30, windowSeconds: 600 } as const
    assert.deepEqual(await checkLimits(store, "1.1.1.1", [limit], START, 15), { allowed: true })
    assert.deepEqual(await checkLimits(store, "1.1.1.1", [limit], START, 15), { allowed: true })
    const third = await checkLimits(store, "1.1.1.1", [limit], START, 1)
    assert.equal(third.allowed, false)
  })

  it("treat a missing or silly weight as one", async () => {
    const store = createMemoryStore(() => START)
    const limit = { name: "w", scope: "client", max: 1, windowSeconds: 600 } as const
    assert.deepEqual(await checkLimits(store, "1.1.1.1", [limit], START, Number.NaN), { allowed: true })
    assert.equal((await checkLimits(store, "1.1.1.1", [limit], START, 0)).allowed, false)
  })
})

describe("createMemoryStore", () => {
  it("forgets a counter once it expires", async () => {
    let time = START
    const store = createMemoryStore(() => time)
    const expiresAt = new Date(START + MINUTE)
    assert.equal(await store.increment("key", expiresAt), 1)
    assert.equal(await store.increment("key", expiresAt), 2)
    time = START + MINUTE
    assert.equal(await store.increment("key", new Date(time + MINUTE)), 1)
  })

  it("stays bounded under a flood of distinct keys", async () => {
    const store = createMemoryStore(() => START)
    const expiresAt = new Date(START + MINUTE)
    for (let i = 0; i < 12_000; i++) await store.increment(`key-${i}`, expiresAt)
    // The first key was dropped when the store reset, so it counts from one again.
    assert.equal(await store.increment("key-0", expiresAt), 1)
  })
})

describe("policies", () => {
  it("puts per-client limits before the shared total", () => {
    for (const limits of Object.values(policies())) {
      const scopes = limits.map((limit) => limit.scope)
      assert.deepEqual(scopes, [...scopes].sort(), JSON.stringify(scopes))
    }
  })

  it("applies the shared daily total to every AI action, and uses the configured value", () => {
    const { chat, deepResearch, insights, screenshot, login } = policies(250)
    for (const limits of [chat, deepResearch, insights, screenshot]) {
      assert.deepEqual(limits.filter((limit) => limit.scope === "everyone").map((limit) => [limit.name, limit.max]), [["ai-total", 250]])
    }
    assert.equal(login.some((limit) => limit.scope === "everyone"), false)
  })

  it("gives deep research the chat limits plus a tighter one of its own", () => {
    const { chat, deepResearch } = policies()
    assert.deepEqual(deepResearch.slice(1), chat)
    assert.ok(deepResearch[0].max < chat[0].max)
  })

  it("lets one visitor load the market history several times per window, though each load is charged per lookup", () => {
    const burst = policies().marketData.find((limit) => limit.scope === "client")
    assert.ok(burst)
    assert.ok(HISTORY_LOOKUPS >= MARKET_LINEUP.length, "charged at least one unit per market")
    assert.ok(burst.max / HISTORY_LOOKUPS >= 5, `${burst.max} / ${HISTORY_LOOKUPS}`)
  })

  it("uses unique counter names", () => {
    const all = policies()
    // The shared AI total is meant to appear in several policies; every other name is its own counter.
    const names = [...new Set(Object.values(all).flat())].filter((limit) => limit.name !== "ai-total").map((limit) => limit.name)
    assert.equal(new Set(names).size, names.length, names.join(","))
  })

  it("limits security notice emails per account, 10 an hour", () => {
    assert.deepEqual(policies().securityNotice, [{ name: "security-notice-account", scope: "client", max: 10, windowSeconds: 3600 }])
  })
})

describe("clientAddress", () => {
  it("prefers x-real-ip, then the first forwarded address", () => {
    assert.equal(clientAddress(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" })), "203.0.113.7")
    assert.equal(clientAddress(headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" })), "198.51.100.1")
  })

  it("accepts IPv6, normalizes case and keeps only the /64 network", () => {
    assert.equal(clientAddress(headers({ "x-real-ip": "2001:DB8::1" })), "2001:db8:0:0::/64")
  })

  it("falls back to one shared bucket for missing or strange values", () => {
    assert.equal(clientAddress(headers({})), "unknown")
    assert.equal(clientAddress(headers({ "x-forwarded-for": "not an ip; drop table" })), "unknown")
    assert.equal(clientAddress(headers({ "x-real-ip": "1".repeat(200) })), "unknown")
    assert.equal(clientAddress(headers({ "x-real-ip": "1::2::3" })), "unknown")
  })

  it("skips an invalid x-real-ip in favor of a valid forwarded address", () => {
    assert.equal(clientAddress(headers({ "x-real-ip": "$ne", "x-forwarded-for": "198.51.100.1" })), "198.51.100.1")
    assert.equal(clientAddress(headers({ "x-real-ip": "1::2::3", "x-forwarded-for": "2001:db8:5::9" })), "2001:db8:5:0::/64")
  })
})

describe("normalizeAddress", () => {
  it("cuts IPv6 to its /64 network, however it's written", () => {
    assert.equal(normalizeAddress("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64")
    assert.equal(normalizeAddress("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"), "2001:db8:1:2::/64")
    assert.equal(normalizeAddress("2001:DB8:1:2:0:0:0:7"), "2001:db8:1:2::/64")
    assert.equal(normalizeAddress("2001:db8::1"), "2001:db8:0:0::/64")
    assert.equal(normalizeAddress("2001:db8:1:2::"), "2001:db8:1:2::/64")
    assert.equal(normalizeAddress("::1"), "0:0:0:0::/64")
    assert.equal(normalizeAddress("::"), "0:0:0:0::/64")
  })

  it("so a client switching addresses inside its /64 stays one visitor, and other networks stay apart", () => {
    const keys = new Set(["2001:db8:1:2::1", "2001:db8:1:2:ffff::9", "2001:0db8:0001:0002:1234:5678:9abc:def0"].map(normalizeAddress))
    assert.equal(keys.size, 1)
    assert.notEqual(normalizeAddress("2001:db8:1:2::1"), normalizeAddress("2001:db8:1:3::1"))
    assert.notEqual(normalizeAddress("2001:db8:1:2::1"), normalizeAddress("2001:db9:1:2::1"))
  })

  it("counts an IPv4 address written as IPv6 as that IPv4 address", () => {
    assert.equal(normalizeAddress("::ffff:203.0.113.7"), "203.0.113.7")
    assert.equal(normalizeAddress("::FFFF:203.0.113.7"), "203.0.113.7")
    assert.equal(normalizeAddress("0:0:0:0:0:ffff:203.0.113.7"), "203.0.113.7")
    assert.equal(normalizeAddress("::ffff:cb00:7107"), "203.0.113.7")
  })

  it("leaves IPv4 as it is", () => {
    assert.equal(normalizeAddress("203.0.113.7"), "203.0.113.7")
  })

  it("refuses malformed IPv6", () => {
    for (const bad of ["1::2::3", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8::", "12345::1", ":1::2", "1:::2", "1:2:3", "::ffff:300.0.0.1", "::ffff:1.2.3", "fe80::1:zz"]) {
      assert.equal(normalizeAddress(bad), null, bad)
    }
  })
})

describe("addressKey", () => {
  it("never contains the address", () => {
    const key = addressKey("203.0.113.7", "s")
    assert.match(key, /^ip-[0-9a-f]{32}$/)
    assert.doesNotMatch(key, /203|113/)
  })

  it("is the same for the same address and secret, so counting still works", () => {
    assert.equal(addressKey("203.0.113.7", "s"), addressKey("203.0.113.7", "s"))
    assert.notEqual(addressKey("203.0.113.7", "s"), addressKey("203.0.113.8", "s"))
  })

  it("depends on the site's secret, so a database reader can't check guessed addresses", () => {
    assert.notEqual(addressKey("203.0.113.7", "secret-a"), addressKey("203.0.113.7", "secret-b"))
  })

  it("still works without a secret (local development)", () => {
    assert.match(addressKey("203.0.113.7", ""), /^ip-[0-9a-f]{32}$/)
    assert.equal(addressKey("203.0.113.7", ""), addressKey("203.0.113.7", ""))
  })

  it("keeps the shared 'unknown' bucket as it is", () => {
    assert.equal(addressKey("unknown", "s"), "unknown")
  })
})

describe("visitorKey", () => {
  it("is the grouped address, hashed", () => {
    assert.equal(visitorKey(headers({ "x-real-ip": "2001:db8:1:2::1" }), "s"), addressKey("2001:db8:1:2::/64", "s"))
    assert.equal(visitorKey(headers({ "x-real-ip": "2001:db8:1:2::1" }), "s"), visitorKey(headers({ "x-real-ip": "2001:db8:1:2:9::9" }), "s"))
    assert.equal(visitorKey(headers({ "x-real-ip": "::ffff:203.0.113.7" }), "s"), visitorKey(headers({ "x-real-ip": "203.0.113.7" }), "s"))
    assert.equal(visitorKey(headers({}), "s"), "unknown")
  })

  it("keeps a /64 to one visitor's limit however many addresses it sends from", async () => {
    const store = createMemoryStore(() => START)
    const { login } = policies()
    for (let i = 0; i < login[0].max; i++) {
      const visitor = visitorKey(headers({ "x-real-ip": `2001:db8:1:2::${(i + 1).toString(16)}` }), "s")
      assert.equal((await checkLimits(store, visitor, login, START)).allowed, true)
    }
    const fresh = visitorKey(headers({ "x-real-ip": "2001:db8:1:2:dead:beef:0:1" }), "s")
    assert.equal((await checkLimits(store, fresh, login, START)).allowed, false)
  })
})

describe("limitMessage", () => {
  it("gives the wait in minutes or hours and says whose limit it was", () => {
    assert.equal(limitMessage({ allowed: false, scope: "client", retryAfterSeconds: 45 }), "You've reached the limit for now. Please try again in about 1 minute.")
    assert.equal(limitMessage({ allowed: false, scope: "client", retryAfterSeconds: 360 }), "You've reached the limit for now. Please try again in about 6 minutes.")
    assert.equal(
      limitMessage({ allowed: false, scope: "everyone", retryAfterSeconds: 18 * 3600 }),
      "The assistant has reached its daily limit. Please try again in about 18 hours."
    )
  })
})

describe("parseDailyTotal", () => {
  it("accepts positive whole numbers and falls back otherwise", () => {
    assert.equal(parseDailyTotal("250"), 250)
    for (const value of [undefined, "", "0", "-5", "12.5", "lots"]) assert.equal(parseDailyTotal(value), DEFAULT_DAILY_TOTAL)
  })
})

describe("per-account login limit", () => {
  const START = Date.UTC(2026, 9, 25, 12, 0, 0)
  const loginAccount = policies().loginAccount

  it("stops guesses at one account even when every guess comes from a different IP", async () => {
    const store = createMemoryStore(() => START)
    const key = accountKey("victim@example.com")
    for (let attempt = 0; attempt < 20; attempt++) {
      // Each attempt would pass the per-IP limit on its own; only the account key is shared.
      assert.deepEqual(await checkLimits(store, key, loginAccount, START), { allowed: true })
    }
    const blocked = await checkLimits(store, key, loginAccount, START)
    assert.equal(blocked.allowed, false)
  })

  it("lets a normal user who mistypes a few times keep trying", async () => {
    const store = createMemoryStore(() => START)
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await checkLimits(store, accountKey("me@example.com"), loginAccount, START)).allowed, true)
    }
  })

  it("doesn't let one account's attempts count against another", async () => {
    const store = createMemoryStore(() => START)
    for (let attempt = 0; attempt < 25; attempt++) await checkLimits(store, accountKey("a@example.com"), loginAccount, START)
    assert.equal((await checkLimits(store, accountKey("b@example.com"), loginAccount, START)).allowed, true)
  })
})

describe("per-device login limit", () => {
  const START = Date.UTC(2026, 9, 27, 12, 0, 0)

  it("keeps a known browser's logins apart from the account's, so others' guesses can't lock the owner out", async () => {
    const store = createMemoryStore(() => START)
    const { loginAccount, loginDevice } = policies()
    // Someone else uses up the account's share from browsers it hasn't been used in...
    for (let attempt = 0; attempt < 30; attempt++) await checkLimits(store, accountKey("owner@example.com"), loginAccount, START)
    assert.equal((await checkLimits(store, accountKey("owner@example.com"), loginAccount, START)).allowed, false)
    // ...and the owner's own browser, counted by its device key, still gets in.
    assert.deepEqual(await checkLimits(store, "device-AAAAAAAAAAAAAAAAAAAAAA", loginDevice, START), { allowed: true })
  })

  it("still slows a copied device cookie", async () => {
    const store = createMemoryStore(() => START)
    const { loginDevice } = policies()
    for (let attempt = 0; attempt < loginDevice[0].max; attempt++) {
      assert.equal((await checkLimits(store, "device-copied", loginDevice, START)).allowed, true)
    }
    assert.equal((await checkLimits(store, "device-copied", loginDevice, START)).allowed, false)
  })
})

describe("two-step codes at login", () => {
  const START = Date.UTC(2026, 9, 27, 0, 0, 0)
  const { twoFactorLogin } = policies()
  const key = twoFactorLoginKey("victim@example.com", null, "secret")

  it("refuses the 6th code in 15 minutes", async () => {
    const store = createMemoryStore(() => START)
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await checkLimits(store, key, twoFactorLogin, START)).allowed, true)
    assert.deepEqual(await checkLimits(store, key, twoFactorLogin, START + 60_000), { allowed: false, scope: "client", retryAfterSeconds: 14 * 60 })
  })

  it("refuses the 21st code in a day, however the tries are spread out", async () => {
    let time = START
    const store = createMemoryStore(() => time)
    for (let window = 0; window < 4; window++) {
      time = START + window * 15 * 60_000
      for (let attempt = 0; attempt < 5; attempt++) assert.equal((await checkLimits(store, key, twoFactorLogin, time)).allowed, true, `window ${window}`)
    }
    time = START + 4 * 15 * 60_000
    const refused = await checkLimits(store, key, twoFactorLogin, time)
    assert.equal(refused.allowed, false)
    assert.ok(!refused.allowed && refused.retryAfterSeconds > 20 * 60 * 60)
  })

  it("allows far fewer guesses a day than the login limits alone (about 1,900)", () => {
    const day = twoFactorLogin.find((limit) => limit.windowSeconds === 24 * 60 * 60)
    assert.ok(day && day.max <= 20)
  })

  it("starts over after a password reset, because the key includes the password version", () => {
    const before = twoFactorLoginKey("victim@example.com", null, "secret")
    const after = twoFactorLoginKey("victim@example.com", new Date("2026-10-27T09:00:00Z"), "secret")
    assert.notEqual(before, after)
    assert.equal(after, twoFactorLoginKey(" Victim@Example.com", new Date("2026-10-27T09:00:00Z"), "secret"))
    assert.equal(twoFactorLoginKey("victim@example.com", new Date("nope"), "secret"), before)
  })

  it("never contains the address", () => {
    const value = twoFactorLoginKey("someone@example.com", new Date(0), "secret")
    assert.doesNotMatch(value, /someone|example/)
    assert.match(value, /^account-[0-9a-f]{32}:pw0$/)
  })

  it("emails the owner at most once a day", () => {
    assert.deepEqual(policies().twoFactorLoginNotice, [{ name: "two-factor-login-notice", scope: "client", max: 1, windowSeconds: 86_400 }])
  })
})

describe("two-step codes typed while signed in", () => {
  const START = Date.UTC(2026, 9, 27, 0, 0, 0)
  const { twoFactorCode } = policies()
  const key = accountKey("victim@example.com", "secret")

  it("refuses the 6th code in 15 minutes", async () => {
    const store = createMemoryStore(() => START)
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await checkLimits(store, key, twoFactorCode, START)).allowed, true)
    assert.deepEqual(await checkLimits(store, key, twoFactorCode, START + 60_000), { allowed: false, scope: "client", retryAfterSeconds: 14 * 60 })
  })

  it("refuses the 21st code in a day, however the tries are spread out", async () => {
    let time = START
    const store = createMemoryStore(() => time)
    for (let window = 0; window < 4; window++) {
      time = START + window * 15 * 60_000
      for (let attempt = 0; attempt < 5; attempt++) assert.equal((await checkLimits(store, key, twoFactorCode, time)).allowed, true, `window ${window}`)
    }
    time = START + 4 * 15 * 60_000
    const refused = await checkLimits(store, key, twoFactorCode, time)
    assert.equal(refused.allowed, false)
    assert.ok(!refused.allowed && refused.retryAfterSeconds > 20 * 60 * 60)
  })

  it("allows no more guesses a day than codes typed at login, far fewer than before (960)", () => {
    const day = twoFactorCode.find((limit) => limit.windowSeconds === 24 * 60 * 60)
    const loginDay = policies().twoFactorLogin.find((limit) => limit.windowSeconds === 24 * 60 * 60)
    assert.ok(day && loginDay && day.max <= loginDay.max)
  })

  it("keeps its own counters, apart from turning two-step verification on and from login codes", () => {
    const names = (limits: readonly Limit[]) => limits.map((limit) => limit.name)
    for (const name of names(twoFactorCode)) {
      assert.equal(names(policies().twoFactor).includes(name), false)
      assert.equal(names(policies().twoFactorLogin).includes(name), false)
    }
  })

  it("emails the owner at most once a day", () => {
    assert.deepEqual(policies().twoFactorCodeNotice, [{ name: "two-factor-code-notice", scope: "client", max: 1, windowSeconds: 86_400 }])
  })
})

describe("sign out everywhere limit", () => {
  it("is per account and small", () => {
    assert.deepEqual(policies().sessionRevoke, [{ name: "session-revoke-account", scope: "client", max: 5, windowSeconds: 3600 }])
  })
})

describe("accountKey", () => {
  it("is the same however the email is typed", () => {
    assert.equal(accountKey("  Me@Example.COM "), accountKey("me@example.com"))
  })

  it("never contains the address itself", () => {
    const key = accountKey("someone@example.com")
    assert.doesNotMatch(key, /someone|example/)
    assert.match(key, /^account-[0-9a-f]{32}$/)
  })

  it("depends on the site's secret, so a database reader can't check a guessed address", () => {
    assert.notEqual(accountKey("someone@example.com", "secret-a"), accountKey("someone@example.com", "secret-b"))
    assert.equal(accountKey("someone@example.com", "secret-a"), accountKey(" Someone@Example.com", "secret-a"))
  })

  it("can't collide with an IP-address counter key", () => {
    assert.notEqual(accountKey("1.2.3.4"), visitorKey({ get: () => "1.2.3.4" }))
  })
})

describe("per-address password reset limit", () => {
  const START = Date.UTC(2026, 9, 26, 9, 0, 0)
  const perAddress = policies().passwordResetAddress

  it("stops a flood of reset emails to one inbox, whichever IP addresses they come from", async () => {
    const store = createMemoryStore(() => START)
    const key = accountKey("victim@example.com")
    for (let request = 0; request < 3; request++) assert.equal((await checkLimits(store, key, perAddress, START)).allowed, true)
    assert.equal((await checkLimits(store, key, perAddress, START)).allowed, false)
  })

  it("keeps one targeted address from using up the site-wide daily reset budget", () => {
    // A refused request sends no email, so one address can cost at most max-per-hour x 24 of the
    // shared daily emails, which must leave room for everyone else.
    const [shared] = policies().passwordResetTotal
    assert.equal(shared.scope, "everyone")
    assert.equal(shared.windowSeconds, 24 * 60 * 60)
    assert.ok(perAddress[0].max * (shared.windowSeconds / perAddress[0].windowSeconds) < shared.max)
  })

  it("counts requests per visitor up front, but not the shared total (that's counted only for emails sent)", () => {
    const { passwordResetRequest } = policies()
    assert.deepEqual(passwordResetRequest.map((limit) => limit.scope), ["client"])
    assert.equal(policies().passwordResetTotal.length, 1)
  })

  it("lets the owner ask again in the next hour, and other addresses are unaffected", async () => {
    const store = createMemoryStore(() => START)
    for (let request = 0; request < 4; request++) await checkLimits(store, accountKey("a@example.com"), perAddress, START)
    assert.equal((await checkLimits(store, accountKey("b@example.com"), perAddress, START)).allowed, true)
    assert.equal((await checkLimits(store, accountKey("a@example.com"), perAddress, START + 61 * 60_000)).allowed, true)
  })
})

describe("account sync limits", () => {
  it("count each account on its own, so one busy account never blocks another", async () => {
    const { accountSync, accountLoad } = policies()
    for (const limit of [...accountSync, ...accountLoad]) assert.equal(limit.scope, "client")
  })

  it("leave plenty of room for a new device's first sync (about 55 uploads)", async () => {
    const store = createMemoryStore(() => 0)
    const busy = accountKey("busy@example.com", "secret")
    for (let i = 0; i < 300; i++) assert.equal((await checkLimits(store, busy, policies().accountSync, 0)).allowed, true)
    assert.equal((await checkLimits(store, busy, policies().accountSync, 0)).allowed, false)
    const other = accountKey("other@example.com", "secret")
    assert.equal((await checkLimits(store, other, policies().accountSync, 0)).allowed, true)
  })
})
