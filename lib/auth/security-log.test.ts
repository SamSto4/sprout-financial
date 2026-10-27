import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildEventDoc,
  cleanCity,
  cleanCountry,
  deviceLabel,
  eventGroup,
  locationLabel,
  MAX_EVENTS_PER_TYPE,
  MAX_ROWS,
  parseStoredEvent,
  parseUserAgent,
  readRequestContext,
  SECURITY_EVENT_TYPES,
  SECURITY_LOG_READ_LIMIT,
  SECURITY_LOG_RETENTION_DAYS,
  securityLogExpiry,
  summarizeEvents,
  trustLocationHeaders,
  type SecurityEvent,
} from "./security-log.ts"

const UA = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  firefoxIpad: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsungAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  operaMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
}

function headers(values: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]))
  return { get: (name: string) => lower[name.toLowerCase()] ?? null }
}

const NOW = Date.parse("2026-10-27T12:00:00Z")
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000)

describe("parseUserAgent", () => {
  it("names common browsers and systems", () => {
    assert.deepEqual(parseUserAgent(UA.chromeWindows), { browser: "Chrome", os: "Windows" })
    assert.deepEqual(parseUserAgent(UA.edgeWindows), { browser: "Edge", os: "Windows" })
    assert.deepEqual(parseUserAgent(UA.safariMac), { browser: "Safari", os: "macOS" })
    assert.deepEqual(parseUserAgent(UA.safariIphone), { browser: "Safari", os: "iPhone" })
    assert.deepEqual(parseUserAgent(UA.chromeIphone), { browser: "Chrome", os: "iPhone" })
    assert.deepEqual(parseUserAgent(UA.firefoxIpad), { browser: "Firefox", os: "iPad" })
    assert.deepEqual(parseUserAgent(UA.chromeAndroid), { browser: "Chrome", os: "Android" })
    assert.deepEqual(parseUserAgent(UA.samsungAndroid), { browser: "Samsung Internet", os: "Android" })
    assert.deepEqual(parseUserAgent(UA.firefoxLinux), { browser: "Firefox", os: "Linux" })
    assert.deepEqual(parseUserAgent(UA.operaMac), { browser: "Opera", os: "macOS" })
    assert.deepEqual(parseUserAgent(UA.chromebook), { browser: "Chrome", os: "ChromeOS" })
  })

  it("leaves out what it can't tell, and never returns the text it was given", () => {
    assert.deepEqual(parseUserAgent("curl/8.4.0"), {})
    assert.deepEqual(parseUserAgent(""), {})
    assert.deepEqual(parseUserAgent(null), {})
    assert.deepEqual(parseUserAgent("<script>alert(1)</script> Windows"), { os: "Windows" })
  })

  it("only reads the start of a very long header", () => {
    assert.deepEqual(parseUserAgent(`${"x".repeat(600)} Windows Firefox/1`), {})
  })
})

describe("cleanCity and cleanCountry", () => {
  it("decodes Vercel's percent-encoded city names", () => {
    assert.equal(cleanCity("S%C3%A3o%20Paulo"), "São Paulo")
    assert.equal(cleanCity("Berlin"), "Berlin")
    assert.equal(cleanCity("St.%20John%E2%80%99s"), "St. John’s")
  })

  it("drops anything that isn't a plausible place name", () => {
    for (const raw of ["", "%E0%A4%A", "<b>x</b>", "Berlin\nBcc: x", "12345", "a".repeat(61), "x".repeat(300), null, undefined]) {
      assert.equal(cleanCity(raw), undefined, JSON.stringify(raw))
    }
  })

  it("accepts two-letter country codes only", () => {
    assert.equal(cleanCountry("DE"), "DE")
    assert.equal(cleanCountry(" de "), "DE")
    for (const raw of ["", "DEU", "D", "1A", null]) assert.equal(cleanCountry(raw), undefined)
  })
})

describe("readRequestContext", () => {
  const request = headers({ "User-Agent": UA.safariIphone, "x-vercel-ip-country": "DE", "x-vercel-ip-city": "M%C3%BCnchen", "x-real-ip": "203.0.113.7" })

  it("reads the device, and the place only where location headers are trusted", () => {
    assert.deepEqual(readRequestContext(request, { trustLocation: true }), { browser: "Safari", os: "iPhone", country: "DE", city: "München" })
    assert.deepEqual(readRequestContext(request, { trustLocation: false }), { browser: "Safari", os: "iPhone" })
  })

  it("never keeps the IP address or the raw user agent", () => {
    const stored = JSON.stringify(readRequestContext(request, { trustLocation: true }))
    assert.equal(stored.includes("203.0.113.7"), false)
    assert.equal(stored.includes("Mozilla"), false)
  })

  it("trusts location headers on Vercel and in local development only", () => {
    assert.equal(trustLocationHeaders({ VERCEL: "1", NODE_ENV: "production" }), true)
    assert.equal(trustLocationHeaders({ NODE_ENV: "development" }), true)
    assert.equal(trustLocationHeaders({ NODE_ENV: "production" }), false)
    assert.equal(trustLocationHeaders({ VERCEL: "0", NODE_ENV: "test" }), false)
  })
})

describe("buildEventDoc", () => {
  const at = new Date("2026-10-27T10:00:00Z")

  it("normalizes the email and sets the expiry", () => {
    const doc = buildEventDoc(" Sam@Example.COM ", { type: "password_wrong", at, browser: "Chrome", os: "Windows" })
    assert.deepEqual(doc, {
      type: "password_wrong",
      at,
      browser: "Chrome",
      os: "Windows",
      userEmail: "sam@example.com",
      expiresAt: new Date("2027-01-25T10:00:00Z"),
    })
  })

  it("keeps only the fields the type allows, and never stores undefined", () => {
    const sneaky = { type: "two_step_on", at, method: "google", secondFactor: "recovery", code: "123456", ip: "203.0.113.7", city: undefined } as unknown as SecurityEvent
    const doc = buildEventDoc("sam@example.com", sneaky)
    assert.deepEqual(Object.keys(doc ?? {}).sort(), ["at", "expiresAt", "type", "userEmail"])
  })

  it("refuses unknown types and bad dates", () => {
    assert.equal(buildEventDoc("sam@example.com", { type: "deleted" as never, at }), null)
    assert.equal(buildEventDoc("sam@example.com", { type: "sign_in", at: new Date("nope") }), null)
    assert.equal(buildEventDoc("  ", { type: "sign_in", at }), null)
  })

  it("expires after the retention period", () => {
    assert.equal(securityLogExpiry(at).getTime() - at.getTime(), SECURITY_LOG_RETENTION_DAYS * 86_400_000)
  })
})

describe("limits", () => {
  it("reads every event an account can hold", () => {
    assert.equal(SECURITY_LOG_READ_LIMIT, MAX_EVENTS_PER_TYPE * SECURITY_EVENT_TYPES.length)
  })

  it("keeps events for 90 days", () => {
    assert.equal(SECURITY_LOG_RETENTION_DAYS, 90)
  })
})

describe("eventGroup", () => {
  it("separates what anyone can set off from the account's own activity", () => {
    const attempts = SECURITY_EVENT_TYPES.filter((type) => eventGroup(type) === "attempt")
    assert.deepEqual(attempts, ["password_wrong", "two_step_prompted", "two_step_failed", "two_step_code_failed", "password_reset_requested"])
  })
})

describe("parseStoredEvent", () => {
  it("reads a stored row and ignores anything unexpected", () => {
    const row = { _id: "x", userEmail: "sam@example.com", type: "sign_in", at: new Date(NOW), method: "password", secondFactor: "app", browser: "Chrome", os: "Windows", city: "Berlin", country: "DE", expiresAt: new Date(NOW) }
    assert.deepEqual(parseStoredEvent(row), { type: "sign_in", at: new Date(NOW), method: "password", secondFactor: "app", browser: "Chrome", os: "Windows", city: "Berlin", country: "DE" })
  })

  it("drops rows it can't trust", () => {
    for (const row of [null, "x", {}, { type: "sign_in", at: "2026-10-27" }, { type: "hacked", at: new Date(NOW) }]) {
      assert.equal(parseStoredEvent(row), null, JSON.stringify(row))
    }
    assert.deepEqual(parseStoredEvent({ type: "sign_in", at: new Date(NOW), browser: "<img>", city: "<b>" }), { type: "sign_in", at: new Date(NOW) })
  })
})

describe("labels", () => {
  it("describes the device", () => {
    assert.equal(deviceLabel({ browser: "Chrome", os: "Windows" }), "Chrome on Windows")
    assert.equal(deviceLabel({ browser: "Firefox" }), "Firefox")
    assert.equal(deviceLabel({ os: "iPhone" }), "Unknown browser on iPhone")
    assert.equal(deviceLabel({}), "Unknown device")
  })

  it("describes the place", () => {
    assert.equal(locationLabel({ city: "Berlin", country: "DE" }), "Berlin, Germany")
    assert.equal(locationLabel({ country: "US" }), "United States")
    assert.equal(locationLabel({ city: "Berlin" }), "Berlin")
    assert.equal(locationLabel({ country: "QQ" }), null)
    assert.equal(locationLabel({}), null)
  })
})

describe("summarizeEvents", () => {
  const phone = { browser: "Safari", os: "iPhone" } as const
  const laptop = { browser: "Chrome", os: "Windows", city: "Lagos", country: "NG" } as const

  it("lists newest first with a title, device, place and time", () => {
    const rows = summarizeEvents(
      [
        { type: "account_created", method: "password", at: minutesAgo(3 * 24 * 60), ...phone },
        { type: "sign_in", method: "password", secondFactor: "app", at: minutesAgo(90), ...phone, city: "Berlin", country: "DE" },
      ],
      NOW
    )
    assert.deepEqual(
      rows.map((row) => [row.title, row.detail, row.when, row.tone]),
      [
        ["Logged in with your password and a code from your app", "Safari on iPhone · Berlin, Germany", "1 hour ago", "normal"],
        ["Account created", "Safari on iPhone", "3 days ago", "normal"],
      ]
    )
    assert.equal(rows[0].at, minutesAgo(90).toISOString())
    assert.equal(rows[0].exact, "Oct 27, 2026, 10:30 AM UTC")
  })

  it("hides the code prompt of a normal two-step login, but not one nobody followed up", () => {
    const rows = summarizeEvents(
      [
        { type: "two_step_prompted", at: minutesAgo(30), ...phone },
        { type: "sign_in", method: "password", secondFactor: "app", at: minutesAgo(29), ...phone },
        // Someone else's device: no sign-in followed, so it stays.
        { type: "two_step_prompted", at: minutesAgo(10), ...laptop },
        // A sign-in more than 10 minutes later doesn't hide a prompt.
        { type: "two_step_prompted", at: minutesAgo(300), ...phone },
        { type: "sign_in", method: "password", secondFactor: "app", at: minutesAgo(280), ...phone },
      ],
      NOW
    )
    assert.deepEqual(
      rows.map((row) => [row.type, row.detail]),
      [
        ["two_step_prompted", "Chrome on Windows · Lagos, Nigeria"],
        ["sign_in", "Safari on iPhone"],
        ["sign_in", "Safari on iPhone"],
        ["two_step_prompted", "Safari on iPhone"],
      ]
    )
    assert.equal(rows[0].tone, "attempt")
  })

  it("hides the prompt when a wrong code followed it, since that row says more", () => {
    const rows = summarizeEvents(
      [
        { type: "two_step_prompted", at: minutesAgo(5), ...laptop },
        { type: "two_step_failed", at: minutesAgo(4), ...laptop },
      ],
      NOW
    )
    assert.deepEqual(rows.map((row) => row.title), ["Correct password entered, but a wrong two-step code"])
  })

  it("groups a burst of failed attempts from one device and place", () => {
    const burst = Array.from({ length: 6 }, (_, i): SecurityEvent => ({ type: "password_wrong", at: minutesAgo(10 + i * 20), ...laptop }))
    const rows = summarizeEvents([...burst, { type: "password_wrong", at: minutesAgo(12), ...phone }], NOW)
    assert.deepEqual(
      rows.map((row) => [row.title, row.count]),
      [
        ["Wrong password entered", 1],
        ["Wrong password entered", 1],
        ["Wrong password entered (5 times)", 5],
      ]
    )
  })

  it("never groups the account's own changes", () => {
    const rows = summarizeEvents(
      [
        { type: "two_step_on", at: minutesAgo(3) },
        { type: "two_step_off", at: minutesAgo(2) },
        { type: "two_step_on", at: minutesAgo(1) },
      ],
      NOW
    )
    assert.deepEqual(rows.map((row) => [row.title, row.tone]), [
      ["Two-step verification turned on", "normal"],
      ["Two-step verification turned off", "warning"],
      ["Two-step verification turned on", "normal"],
    ])
  })

  it("says what a wrong code typed while logged in was for, and groups repeats of the same thing only", () => {
    const rows = summarizeEvents(
      [
        { type: "two_step_code_failed", action: "delete", at: minutesAgo(1), ...laptop },
        { type: "two_step_code_failed", action: "delete", at: minutesAgo(2), ...laptop },
        { type: "two_step_code_failed", action: "delete", at: minutesAgo(3), ...laptop },
        { type: "two_step_code_failed", action: "off", at: minutesAgo(4), ...laptop },
        { type: "two_step_code_failed", action: "new-codes", at: minutesAgo(5), ...laptop },
      ],
      NOW
    )
    assert.deepEqual(rows.map((row) => [row.title, row.tone]), [
      ["Wrong two-step code entered to delete your account (3 times)", "attempt"],
      ["Wrong two-step code entered to turn off two-step verification", "attempt"],
      ["Wrong two-step code entered to make new recovery codes", "attempt"],
    ])
  })

  it("keeps what a wrong code was for only on that type, and only from the list", () => {
    const at = minutesAgo(1)
    assert.equal(buildEventDoc("sam@example.com", { type: "two_step_code_failed", action: "off", at })?.action, "off")
    const forged = buildEventDoc("sam@example.com", { type: "two_step_code_failed", at, action: "<script>" as never })
    assert.equal(forged && "action" in forged, false)
    const other = buildEventDoc("sam@example.com", { type: "two_step_failed", at, action: "delete" })
    assert.equal(other && "action" in other, false)
    assert.deepEqual(parseStoredEvent({ type: "two_step_code_failed", at, action: "new-codes", code: "123456" }), { type: "two_step_code_failed", at, action: "new-codes" })
  })

  it("titles a wrong password typed to turn on two-step verification apart from a failed login", () => {
    const rows = summarizeEvents(
      [
        { type: "password_wrong", action: "two-step-on", at: minutesAgo(1), ...laptop },
        { type: "password_wrong", action: "two-step-on", at: minutesAgo(2), ...laptop },
        { type: "password_wrong", at: minutesAgo(3), ...laptop },
      ],
      NOW
    )
    // The owner mistyping their own password while logged in isn't grouped with login failures.
    assert.deepEqual(rows.map((row) => [row.title, row.tone]), [
      ["Wrong password entered to turn on two-step verification (2 times)", "attempt"],
      ["Wrong password entered", "attempt"],
    ])
  })

  it("keeps what a wrong password was for only as two-step-on", () => {
    const at = minutesAgo(1)
    assert.equal(buildEventDoc("sam@example.com", { type: "password_wrong", action: "two-step-on", at })?.action, "two-step-on")
    for (const action of ["off", "delete", "<script>"]) {
      const doc = buildEventDoc("sam@example.com", { type: "password_wrong", at, action: action as never })
      assert.equal(doc && "action" in doc, false, action)
    }
    // Only password_wrong takes it.
    const other = buildEventDoc("sam@example.com", { type: "two_step_code_failed", at, action: "two-step-on" })
    assert.equal(other && "action" in other, false)
    assert.deepEqual(parseStoredEvent({ type: "password_wrong", at, action: "two-step-on", password: "x" }), { type: "password_wrong", at, action: "two-step-on" })
  })

  it("lists Sign out everywhere as the account's own activity, with its device", () => {
    const [row] = summarizeEvents([{ type: "signed_out_everywhere", at: minutesAgo(5), ...laptop }], NOW)
    assert.equal(row.title, "Signed out everywhere")
    assert.equal(row.tone, "normal")
    assert.equal(eventGroup("signed_out_everywhere"), "activity")
    // Fields that don't belong to this type are dropped.
    const doc = buildEventDoc("sam@example.com", { type: "signed_out_everywhere", at: minutesAgo(5), method: "google", secondFactor: "app" })
    assert.equal(doc?.type, "signed_out_everywhere")
    assert.equal(doc && "method" in doc, false)
    assert.equal(doc && "secondFactor" in doc, false)
  })

  it("stops at the row limit", () => {
    const many = Array.from({ length: 80 }, (_, i): SecurityEvent => ({ type: "sign_in", method: "google", at: minutesAgo(i) }))
    assert.equal(summarizeEvents(many, NOW).length, MAX_ROWS)
    assert.equal(summarizeEvents(many, NOW, 10).length, 10)
  })

  it("has a title for every type", () => {
    for (const type of SECURITY_EVENT_TYPES) {
      const [row] = summarizeEvents([{ type, at: minutesAgo(1) }], NOW)
      assert.ok(row.title.length > 0, type)
    }
  })
})
