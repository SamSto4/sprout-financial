import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  budgetForMonth,
  clearMonthBudget,
  currentMonthFor,
  EXAMPLE_BUDGET,
  MAX_SAVED_MONTHS,
  mergeBudgets,
  monthKey,
  monthLabel,
  parseSavedBudgets,
  saveMonthBudget,
  savedMonths,
  shiftMonth,
  startDayFor,
  type SavedBudgets,
} from "./budget-history.ts"
import { budgetPeriod } from "./budget-period.ts"
import { buildCashFlow, moveSchedule, type MonthSchedule } from "./cash-flow.ts"

const oct = { income: 3200, needs: 1600, wants: 900, savings: 700 }
/** How `oct`, saved before groceries/recurring/misc/investments existed, reads back: those lines at 0. */
const octFull = { ...oct, groceries: 0, recurring: 0, misc: 0, investments: 0 }
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
    assert.deepEqual(budgetForMonth(saved, "2026-10"), { ...octFull, source: "saved" })
  })

  it("starts a new month from the latest earlier month without saving it", () => {
    const saved = saveMonthBudget(saveMonthBudget(null, "2026-08", { ...oct, income: 1 }, now), "2026-09", oct, now)
    assert.deepEqual(budgetForMonth(saved, "2026-11"), { ...octFull, source: "carried", fromMonth: "2026-09" })
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
    assert.deepEqual(ok.months["2026-10"], { income: 0, needs: 0, groceries: 0, recurring: 0, wants: 10_000_000, misc: 0, savings: 10, investments: 0, updatedAt: now.toISOString() })
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
    const local = { updatedAt: "2026-10-02", months: { "2026-10": { ...octFull, updatedAt: "2026-10-02" }, "2026-08": { ...octFull, updatedAt: "2026-08-01" } } }
    const remote = { updatedAt: "2026-10-03", months: { "2026-10": { ...octFull, income: 1, updatedAt: "2026-10-01" }, "2026-09": { ...octFull, updatedAt: "2026-10-03" } } }
    const merged = mergeBudgets(local, remote)
    assert.deepEqual(Object.keys(merged?.months ?? {}).sort(), ["2026-08", "2026-09", "2026-10"])
    assert.equal(merged?.months["2026-10"].income, 3200)
    assert.equal(merged?.updatedAt, "2026-10-03")
    assert.equal(mergeBudgets(null, remote), remote)
  })
})

describe("start days", () => {
  const lines = { needs: 1200, groceries: 400, recurring: 100, wants: 500, misc: 100, savings: 300, investments: 400 }
  const november = new Date("2026-11-08T09:00:00Z")
  // Paid on the 7th and the 21st; the November budget runs Nov 7 – Dec 6.
  const novemberFrom7th: MonthSchedule = {
    startingBalance: 300,
    paychecks: [
      { id: "p-1", date: "2026-11-07", amount: 1600, label: "Pay" },
      { id: "p-2", date: "2026-11-21", amount: 1600, label: "Pay" },
    ],
    bills: [
      { id: "b-rent", date: "2026-12-01", amount: 1400, label: "Rent", category: "needs" },
      { id: "b-card", date: "2026-11-25", amount: 200, label: "Card", category: "needs" },
      { id: "b-phone", date: "2026-12-06", amount: 60, label: "Phone", category: "recurring" },
    ],
  }

  it("keeps the start day and the entries it allows, and stores nothing extra for the 1st", () => {
    const saved = saveMonthBudget(null, "2026-11", { income: 0, ...lines, startDay: 7, schedule: novemberFrom7th }, november)
    assert.equal(saved.months["2026-11"].startDay, 7)
    assert.equal(saved.months["2026-11"].schedule?.bills.length, 3)
    assert.equal(saved.months["2026-11"].income, 3200)
    assert.equal(budgetForMonth(saved, "2026-11").startDay, 7)
    const first = saveMonthBudget(null, "2026-11", { income: 3000, ...lines, startDay: 1 }, november)
    assert.equal("startDay" in first.months["2026-11"], false)
    assert.equal("startDay" in budgetForMonth(first, "2026-11"), false)
  })

  it("drops entries after the calendar month when a save leaves the start day out (why the planner always passes it)", () => {
    const saved = saveMonthBudget(null, "2026-11", { income: 0, ...lines, schedule: novemberFrom7th }, november)
    assert.equal(saved.months["2026-11"].startDay, undefined)
    assert.deepEqual(saved.months["2026-11"].schedule?.bills.map((bill) => bill.label), ["Card"])
  })

  it("keeps everything when an amount changes and the start day is passed along, as the planner does", () => {
    const saved = saveMonthBudget(null, "2026-11", { income: 0, ...lines, startDay: 7, schedule: novemberFrom7th }, november)
    // The planner's update(): what's on screen, the start day included, plus the change.
    const { income, schedule, startDay } = budgetForMonth(saved, "2026-11")
    const edited = saveMonthBudget(saved, "2026-11", { income, ...lines, schedule, startDay, groceries: 450 }, november)
    assert.equal(edited.months["2026-11"].startDay, 7)
    assert.equal(edited.months["2026-11"].groceries, 450)
    assert.deepEqual(edited.months["2026-11"].schedule, saved.months["2026-11"].schedule)
  })

  it("reads invalid start days from storage or sync as the 1st", () => {
    for (const bad of [0, 32, 1.5, "7", null, -7]) {
      const parsed = parseSavedBudgets({
        updatedAt: "",
        months: { "2026-11": { income: 1, needs: 1, wants: 1, savings: 1, startDay: bad, schedule: { bills: [{ date: "2026-12-03", amount: 5 }, { date: "2026-11-20", amount: 5 }] }, updatedAt: "" } },
      })
      assert.ok(parsed?.months["2026-11"], String(bad)) // the month itself is kept
      assert.equal(parsed.months["2026-11"].startDay, undefined, String(bad))
      assert.equal("startDay" in parsed.months["2026-11"], false, String(bad))
      assert.equal(budgetForMonth(parsed, "2026-11").startDay, undefined, String(bad))
      // ...and its schedule is checked against the calendar month.
      assert.deepEqual(parsed.months["2026-11"].schedule?.bills.map((bill) => bill.date), ["2026-11-20"], String(bad))
    }
  })

  it("reads months saved before start days existed exactly as before", () => {
    const old = { updatedAt: "2026-10-01", months: { "2026-10": { income: 3200, needs: 1600, wants: 900, savings: 700, updatedAt: "2026-10-01" } } }
    const parsed = parseSavedBudgets(old)
    assert.equal("startDay" in (parsed?.months["2026-10"] ?? {}), false)
    assert.deepEqual(parseSavedBudgets(JSON.parse(JSON.stringify(parsed))), parsed)
    assert.equal(JSON.stringify(parseSavedBudgets(JSON.parse(JSON.stringify(parsed)))), JSON.stringify(parsed))
  })

  it("survives a sync round trip", () => {
    const saved = saveMonthBudget(null, "2026-11", { income: 0, ...lines, startDay: 7, schedule: novemberFrom7th }, november)
    assert.deepEqual(parseSavedBudgets(JSON.parse(JSON.stringify(saved))), saved)
    // Same bytes, so the sync's change check (JSON.stringify) doesn't see a difference.
    assert.equal(JSON.stringify(parseSavedBudgets(JSON.parse(JSON.stringify(saved)))), JSON.stringify(saved))
  })

  it("carries the start day and the schedule into a month with no plan yet", () => {
    const saved = saveMonthBudget(null, "2026-11", { income: 0, ...lines, startDay: 7, schedule: novemberFrom7th }, november)
    const december = budgetForMonth(saved, "2026-12")
    assert.equal(december.source, "carried")
    assert.equal(december.fromMonth, "2026-11")
    assert.equal(december.startDay, 7)
    assert.deepEqual(december.schedule?.bills.map((bill) => bill.date), ["2027-01-01", "2026-12-25", "2027-01-06"])
    assert.deepEqual(december.schedule, moveSchedule(novemberFrom7th, "2026-12", 7))
  })

  it("leaves earlier months' ranges alone when a later month's start day changes", () => {
    const october = saveMonthBudget(null, "2026-10", { income: 0, ...lines, schedule: { startingBalance: 0, paychecks: [], bills: [{ id: "b", date: "2026-10-02", amount: 5, label: "", category: "needs" }] } }, november)
    const saved = saveMonthBudget(october, "2026-11", { income: 3000, ...lines, startDay: 15 }, november)
    assert.equal(saved.months["2026-10"].startDay, undefined)
    assert.equal(saved.months["2026-10"].schedule?.bills[0].date, "2026-10-02")
  })

  it("merges month by month, the newer copy's start day winning", () => {
    const older = saveMonthBudget(null, "2026-11", { income: 3000, ...lines }, new Date("2026-11-01T00:00:00Z"))
    const newer = saveMonthBudget(null, "2026-11", { income: 3000, ...lines, startDay: 15 }, new Date("2026-11-02T00:00:00Z"))
    assert.equal(mergeBudgets(older, newer)?.months["2026-11"].startDay, 15)
    assert.equal(mergeBudgets(newer, older)?.months["2026-11"].startDay, 15)
    const both: SavedBudgets | null = mergeBudgets(newer, saveMonthBudget(null, "2026-10", { income: 1, ...lines, startDay: 7 }, november))
    assert.deepEqual(Object.keys(both?.months ?? {}).sort(), ["2026-10", "2026-11"])
    assert.equal(both?.months["2026-10"].startDay, 7)
  })

  it("works out each month's start day and the month on screen", () => {
    const saved = saveMonthBudget(null, "2026-10", { income: 1, needs: 1, wants: 1, savings: 1, startDay: 7 }, november)
    assert.equal(startDayFor(saved, "2026-10"), 7)
    assert.equal(startDayFor(saved, "2026-11"), 7) // carried
    assert.equal(startDayFor(saved, "2026-09"), 1) // nothing earlier: the 1st
    assert.equal(currentMonthFor(saved, "2026-11-06"), "2026-10")
    assert.equal(currentMonthFor(saved, "2026-11-07"), "2026-11")
    assert.equal(currentMonthFor(null, "2026-11-01"), "2026-11")
  })

  it("opens a month whose later start day left a gap, not the one that already ended", () => {
    // October 27, and October now starts on the 28th: September (the 1st) ended on the 30th.
    const saved = saveMonthBudget(null, "2026-10", { income: 1, needs: 1, wants: 1, savings: 1, startDay: 28 }, november)
    assert.equal(currentMonthFor(saved, "2026-10-27"), "2026-10")
  })
})

describe("start days 29 to 31, carried month after month", () => {
  const lines = { needs: 1500, groceries: 400, recurring: 100, wants: 300, misc: 100, savings: 300, investments: 300 }
  const months = Array.from({ length: 23 }, (_, index) => shiftMonth("2027-02", index)) // Feb 2027 to Dec 2028, both Februaries

  /**
   * Opens each month after `first` the way someone using the planner would: the month is carried
   * from the one before, then one amount is changed, which saves it (the planner's update()).
   */
  function carryAndEdit(startDay: number, first: MonthSchedule, firstMonth: string) {
    let saved = saveMonthBudget(null, firstMonth, { income: 0, ...lines, startDay, schedule: first }, now)
    const seen: { month: string; carried: MonthSchedule; saved: MonthSchedule }[] = []
    for (const month of months) {
      const view = budgetForMonth(saved, month)
      assert.equal(view.source, "carried", month)
      const { income, schedule } = view
      saved = saveMonthBudget(saved, month, { income, ...lines, schedule, startDay: view.startDay, groceries: 410 }, now)
      seen.push({ month, carried: schedule!, saved: saved.months[month].schedule! })
    }
    return seen
  }

  for (const startDay of [29, 30, 31]) {
    it(`keeps the paycheck on the range's first day, with no false shortfall (start day ${startDay})`, () => {
      // Paid on the start day; rent on the 1st, a card bill on the 10th.
      const january: MonthSchedule = {
        startingBalance: 0,
        paychecks: [{ id: "salary", date: budgetPeriod("2027-01", startDay).start, amount: 3000, label: "Salary" }],
        bills: [
          { id: "rent", date: "2027-02-01", amount: 1500, label: "Rent", category: "needs" },
          { id: "card", date: "2027-02-10", amount: 300, label: "Card", category: "needs" },
        ],
      }
      for (const { month, carried, saved } of carryAndEdit(startDay, january, "2027-01")) {
        const period = budgetPeriod(month, startDay)
        for (const schedule of [carried, saved]) {
          assert.equal(schedule.paychecks[0].date, period.start, `${month}: salary`)
          assert.deepEqual(schedule.bills.map((bill) => Number(bill.date.slice(8, 10))), [1, 10], `${month}: bills`)
          assert.deepEqual(buildCashFlow(schedule).shortfalls, [], `${month}: shortfalls`)
        }
      }
    })
  }

  it("reads a month saved without intended days by what its dates stand for (the range's first day is the start day)", () => {
    // February as it was saved before days were kept: the salary on Feb 28, its range's first day.
    const saved = parseSavedBudgets({
      updatedAt: "",
      months: {
        "2027-02": {
          income: 3000, ...lines, startDay: 30, updatedAt: "",
          schedule: { paychecks: [{ id: "salary", date: "2027-02-28", amount: 3000 }], bills: [{ id: "rent", date: "2027-03-01", amount: 1500, category: "needs" }] },
        },
      },
    })
    const march = budgetForMonth(saved, "2027-03")
    assert.deepEqual(march.schedule?.paychecks.map((paycheck) => paycheck.date), ["2027-03-30"])
    assert.deepEqual(buildCashFlow(march.schedule!).shortfalls, [])
  })

  it("puts a bill on the 31st on the 31st again after a 30-day month (calendar months)", () => {
    const january: MonthSchedule = { startingBalance: 2000, paychecks: [], bills: [{ id: "car", date: "2027-01-31", amount: 300, label: "Car", category: "needs" }] }
    for (const { month, saved } of carryAndEdit(1, january, "2027-01")) {
      const lastDay = budgetPeriod(month, 1).end
      assert.equal(saved.bills[0].date, lastDay, month) // the 31st, or the month's last day when it has none
    }
  })

  it("restores every date when the start day changes and changes back, as the planner does it", () => {
    // October 2026 with a bill on every day; the planner's changeStartDay() moves and saves.
    const october: MonthSchedule = {
      startingBalance: 0,
      paychecks: [],
      bills: Array.from({ length: 31 }, (_, i) => ({ id: `b${i + 1}`, date: `2026-10-${String(i + 1).padStart(2, "0")}`, amount: 1, label: "", category: "needs" as const })),
    }
    const original = saveMonthBudget(null, "2026-10", { income: 0, ...lines, schedule: october }, now)
    const change = (saved: SavedBudgets, startDay: number) => {
      const view = budgetForMonth(saved, "2026-10")
      return saveMonthBudget(saved, "2026-10", { income: view.income, ...lines, startDay, schedule: moveSchedule(view.schedule!, "2026-10", startDay) }, now)
    }
    for (let startDay = 2; startDay <= 31; startDay++) {
      const moved = change(original, startDay)
      assert.equal(moved.months["2026-10"].schedule?.bills.length, 31, `start ${startDay}`)
      const back = change(moved, 1)
      assert.deepEqual(back.months["2026-10"].schedule, original.months["2026-10"].schedule, `start ${startDay} and back`)
    }
    // The case from the review: rent on the 30th, October starting on the 31st (Oct 31 to Nov 29).
    const rentOnly = saveMonthBudget(null, "2026-10", { income: 0, ...lines, schedule: { ...october, bills: [october.bills[29]] } }, now)
    const on31st = change(rentOnly, 31)
    assert.equal(on31st.months["2026-10"].schedule?.bills[0].date, "2026-11-29")
    assert.equal(change(on31st, 1).months["2026-10"].schedule?.bills[0].date, "2026-10-30")
  })
})
