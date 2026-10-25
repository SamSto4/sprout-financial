import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  budgetForMonth,
  clearMonthBudget,
  EXAMPLE_BUDGET,
  MAX_SAVED_MONTHS,
  mergeBudgets,
  monthKey,
  monthLabel,
  parseSavedBudgets,
  saveMonthBudget,
  savedMonths,
  shiftMonth,
} from "./budget-history.ts"

const oct = { income: 3200, needs: 1600, wants: 900, savings: 700 }
const now = new Date("2026-10-25T12:00:00Z")

describe("months", () => {
  it("formats and shifts months across year boundaries", () => {
    assert.equal(monthKey(new Date(2026, 9, 25)), "2026-10")
    assert.equal(shiftMonth("2026-01", -1), "2025-12")
    assert.equal(shiftMonth("2026-12", 1), "2027-01")
    assert.equal(shiftMonth("2026-10", -13), "2025-09")
    assert.equal(monthLabel("2026-10"), "October 2026")
  })
})

describe("budgetForMonth", () => {
  it("shows example numbers when nothing is saved", () => {
    assert.deepEqual(budgetForMonth(null, "2026-10"), { ...EXAMPLE_BUDGET, source: "example" })
  })

  it("shows the month's own saved plan", () => {
    const saved = saveMonthBudget(null, "2026-10", oct, now)
    assert.deepEqual(budgetForMonth(saved, "2026-10"), { ...oct, source: "saved" })
  })

  it("starts a new month from the latest earlier month without saving it", () => {
    const saved = saveMonthBudget(saveMonthBudget(null, "2026-08", { ...oct, income: 1 }, now), "2026-09", oct, now)
    assert.deepEqual(budgetForMonth(saved, "2026-11"), { ...oct, source: "carried", fromMonth: "2026-09" })
    assert.deepEqual(savedMonths(saved), ["2026-09", "2026-08"])
  })

  it("never carries a later month backwards", () => {
    const saved = saveMonthBudget(null, "2026-10", oct, now)
    assert.equal(budgetForMonth(saved, "2026-09").source, "example")
  })
})

describe("saving", () => {
  it("clamps bad amounts and ignores bad month keys", () => {
    const saved = saveMonthBudget(null, "2026-10", { income: -5, needs: Number.NaN, wants: 1e12, savings: 10 }, now)
    assert.equal(saved.months["2026-10"], undefined)
    const ok = saveMonthBudget(null, "2026-10", { income: -5, needs: 0, wants: 1e12, savings: 10 }, now)
    assert.deepEqual(ok.months["2026-10"], { income: 0, needs: 0, wants: 10_000_000, savings: 10, updatedAt: now.toISOString() })
    assert.deepEqual(saveMonthBudget(null, "2026-13", oct, now).months, {})
  })

  it("keeps only the newest months", () => {
    let saved = null as ReturnType<typeof saveMonthBudget> | null
    for (let i = 0; i < MAX_SAVED_MONTHS + 4; i++) saved = saveMonthBudget(saved, shiftMonth("2020-01", i), oct, now)
    assert.equal(savedMonths(saved).length, MAX_SAVED_MONTHS)
    assert.equal(savedMonths(saved).at(-1), shiftMonth("2020-01", 4))
  })

  it("clears one month", () => {
    const saved = clearMonthBudget(saveMonthBudget(null, "2026-10", oct, now), "2026-10", now)
    assert.deepEqual(saved.months, {})
  })
})

describe("parseSavedBudgets", () => {
  it("drops malformed months and junk keys", () => {
    const parsed = parseSavedBudgets({
      updatedAt: "x",
      months: { "2026-10": { ...oct, updatedAt: "a" }, "2026-99": oct, $where: oct, "2026-09": { income: "lots" } },
    })
    assert.deepEqual(Object.keys(parsed?.months ?? {}), ["2026-10"])
    assert.equal(parseSavedBudgets("nope"), null)
  })
})

describe("mergeBudgets", () => {
  it("keeps every month and the newer copy of each", () => {
    const local = { updatedAt: "2026-10-02", months: { "2026-10": { ...oct, updatedAt: "2026-10-02" }, "2026-08": { ...oct, updatedAt: "2026-08-01" } } }
    const remote = { updatedAt: "2026-10-03", months: { "2026-10": { ...oct, income: 1, updatedAt: "2026-10-01" }, "2026-09": { ...oct, updatedAt: "2026-10-03" } } }
    const merged = mergeBudgets(local, remote)
    assert.deepEqual(Object.keys(merged?.months ?? {}).sort(), ["2026-08", "2026-09", "2026-10"])
    assert.equal(merged?.months["2026-10"].income, 3200)
    assert.equal(merged?.updatedAt, "2026-10-03")
    assert.equal(mergeBudgets(null, remote), remote)
  })
})
