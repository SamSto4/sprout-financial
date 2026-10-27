import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { formatDateRange, formatOrdinal } from "./format.ts"

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
