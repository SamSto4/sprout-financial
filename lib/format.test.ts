import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { countryName, formatDateRange, formatDateTimeUtc, formatOrdinal, formatTimeAgo } from "./format.ts"

const NOW = Date.parse("2026-10-27T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatTimeAgo", () => {
  it("counts minutes, hours and days, then gives the date", () => {
    assert.equal(formatTimeAgo(ago(30_000), NOW), "Just now")
    assert.equal(formatTimeAgo(ago(MINUTE), NOW), "1 minute ago")
    assert.equal(formatTimeAgo(ago(59 * MINUTE), NOW), "59 minutes ago")
    assert.equal(formatTimeAgo(ago(HOUR), NOW), "1 hour ago")
    assert.equal(formatTimeAgo(ago(23 * HOUR), NOW), "23 hours ago")
    assert.equal(formatTimeAgo(ago(DAY), NOW), "1 day ago")
    assert.equal(formatTimeAgo(ago(6 * DAY), NOW), "6 days ago")
    assert.equal(formatTimeAgo(ago(7 * DAY), NOW), "Oct 20, 2026")
  })

  it("reads a time slightly in the future, or an invalid one, as just now", () => {
    assert.equal(formatTimeAgo(new Date(NOW + 5 * MINUTE), NOW), "Just now")
    assert.equal(formatTimeAgo(new Date("nope"), NOW), "Just now")
  })
})

describe("formatDateTimeUtc", () => {
  it("says the time zone, since the reader's isn't known", () => {
    assert.equal(formatDateTimeUtc(new Date("2026-10-27T14:05:00Z")), "Oct 27, 2026, 2:05 PM UTC")
    assert.equal(formatDateTimeUtc(new Date("2026-01-02T00:00:00Z")), "Jan 2, 2026, 12:00 AM UTC")
  })
})

describe("countryName", () => {
  it("names countries by their two-letter code", () => {
    assert.equal(countryName("DE"), "Germany")
    assert.equal(countryName("GB"), "United Kingdom")
  })

  it("is null for anything else", () => {
    for (const code of ["QQ", "ZZ", "de", "DEU", ""]) assert.equal(countryName(code), null, code)
  })
})

describe("formatDateRange", () => {
  it("writes a budget month's range without the year", () => {
    assert.equal(formatDateRange("2026-11-07", "2026-12-06"), "Nov 7 – Dec 6")
    assert.equal(formatDateRange("2026-12-07", "2027-01-06"), "Dec 7 – Jan 6")
    assert.equal(formatDateRange("2026-10-01", "2026-10-31"), "Oct 1 – Oct 31")
  })
})

describe("formatOrdinal", () => {
  it("adds st, nd, rd and th, with 11th to 13th as exceptions", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28, 31].map(formatOrdinal),
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th", "31st"]
    )
    assert.deepEqual([111, 112, 101, 102].map(formatOrdinal), ["111th", "112th", "101st", "102nd"])
  })
})
