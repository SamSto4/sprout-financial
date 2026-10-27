import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  addDays,
  budgetPeriod,
  currentBudgetMonth,
  dateFor,
  dateForDay,
  daysInMonth,
  DEFAULT_START_DAY,
  isInPeriod,
  isRealDate,
  MAX_START_DAY,
  parseStartDay,
  todayKey,
} from "./budget-period.ts"
import * as cashFlow from "./cash-flow.ts"

const range = (month: string, startDay: number) => {
  const period = budgetPeriod(month, startDay)
  return [period.start, period.end, period.days]
}

describe("budgetPeriod", () => {
  it("is the calendar month when the budget starts on the 1st", () => {
    assert.deepEqual(range("2026-11", 1), ["2026-11-01", "2026-11-30", 30])
    assert.deepEqual(range("2026-12", 1), ["2026-12-01", "2026-12-31", 31])
    assert.deepEqual(range("2026-02", 1), ["2026-02-01", "2026-02-28", 28])
    assert.deepEqual(range("2028-02", 1), ["2028-02-01", "2028-02-29", 29])
    assert.equal(DEFAULT_START_DAY, 1)
    assert.equal(MAX_START_DAY, 31)
  })

  it("runs to the day before the same day next month", () => {
    assert.deepEqual(range("2026-11", 7), ["2026-11-07", "2026-12-06", 30])
    assert.deepEqual(range("2026-11", 15), ["2026-11-15", "2026-12-14", 30])
    assert.deepEqual(range("2026-11", 28), ["2026-11-28", "2026-12-27", 30])
    assert.equal(budgetPeriod("2026-11", 7).month, "2026-11")
    assert.equal(budgetPeriod("2026-11", 7).startDay, 7)
  })

  it("crosses into the next year from December", () => {
    assert.deepEqual(range("2026-12", 7), ["2026-12-07", "2027-01-06", 31])
    assert.deepEqual(range("2026-12", 31), ["2026-12-31", "2027-01-30", 31])
  })

  it("starts on the last day in months without the 29th, 30th or 31st", () => {
    assert.deepEqual(range("2026-11", 29), ["2026-11-29", "2026-12-28", 30])
    assert.deepEqual(range("2026-11", 30), ["2026-11-30", "2026-12-29", 30])
    assert.deepEqual(range("2026-11", 31), ["2026-11-30", "2026-12-30", 31])
    assert.deepEqual(range("2026-04", 31), ["2026-04-30", "2026-05-30", 31])
    // January's range ends where February's (clamped) start begins.
    assert.deepEqual(range("2026-01", 29), ["2026-01-29", "2026-02-27", 30])
    assert.deepEqual(range("2026-01", 30), ["2026-01-30", "2026-02-27", 29])
    assert.deepEqual(range("2026-01", 31), ["2026-01-31", "2026-02-27", 28])
    // The start day is kept as chosen, even where the range starts earlier.
    assert.equal(budgetPeriod("2026-11", 31).startDay, 31)
  })

  it("handles February in leap and non-leap years", () => {
    assert.deepEqual(range("2026-02", 29), ["2026-02-28", "2026-03-28", 29])
    assert.deepEqual(range("2026-02", 30), ["2026-02-28", "2026-03-29", 30])
    assert.deepEqual(range("2026-02", 31), ["2026-02-28", "2026-03-30", 31])
    assert.deepEqual(range("2028-02", 29), ["2028-02-29", "2028-03-28", 29])
    assert.deepEqual(range("2028-02", 30), ["2028-02-29", "2028-03-29", 30])
    assert.deepEqual(range("2028-01", 30), ["2028-01-30", "2028-02-28", 30])
  })

  it("tiles the calendar with no gaps or overlaps when the start day stays the same", () => {
    for (const startDay of [1, 7, 15, 28, 29, 30, 31]) {
      let month = "2027-10"
      for (let i = 0; i < 18; i++) {
        const [year, monthNumber] = month.split("-").map(Number)
        const next = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`
        assert.equal(addDays(budgetPeriod(month, startDay).end, 1), budgetPeriod(next, startDay).start, `${month} day ${startDay}`)
        month = next
      }
    }
  })

  it("reads an invalid start day as the 1st, and never runs past year 9999", () => {
    for (const bad of [0, 32, 1.5, -1, Number.NaN]) {
      assert.equal(budgetPeriod("2026-11", bad).start, "2026-11-01", String(bad))
      assert.equal(budgetPeriod("2026-11", bad).startDay, 1, String(bad))
    }
    assert.deepEqual(range("9999-12", 7), ["9999-12-07", "9999-12-31", 25])
  })
})

describe("days in a month", () => {
  it("follows the leap-year rule for every 4-digit year, including 0–99", () => {
    assert.deepEqual(["2026-02", "2028-02", "1900-02", "2000-02", "0004-02", "0100-02"].map(daysInMonth), [28, 29, 28, 29, 29, 28])
    assert.deepEqual(["2026-01", "2026-04", "2026-06", "2026-09", "2026-11", "2026-12"].map(daysInMonth), [31, 30, 30, 30, 30, 31])
    assert.equal(dateFor("2026-11", 31), "2026-11-30")
    assert.equal(dateFor("2026-11", 0), "2026-11-01")
  })

  it("is the same function cash-flow.ts has always exported", () => {
    assert.equal(cashFlow.daysInMonth, daysInMonth)
    assert.equal(cashFlow.dateFor, dateFor)
  })
})

describe("parseStartDay", () => {
  it("accepts whole days 1 to 31 and nothing else", () => {
    assert.deepEqual([1, 7, 31].map(parseStartDay), [1, 7, 31])
    for (const bad of [0, 32, 1.5, "7", null, undefined, Number.NaN, Infinity, -3, true, [7], { day: 7 }]) {
      assert.equal(parseStartDay(bad), null, String(bad))
    }
  })
})

describe("dates in a budget month", () => {
  const november = budgetPeriod("2026-11", 7)

  it("includes both ends and nothing outside", () => {
    assert.equal(isInPeriod("2026-11-07", november), true)
    assert.equal(isInPeriod("2026-12-06", november), true)
    for (const bad of ["2026-11-06", "2026-12-07", "2026-11-31", "2026-13-01", "2026-11-7", "", null, 20261107]) {
      assert.equal(isInPeriod(bad, november), false, String(bad))
    }
  })

  it("knows real dates", () => {
    assert.equal(isRealDate("2028-02-29"), true)
    assert.equal(isRealDate("2026-02-29"), false)
    assert.equal(isRealDate("2026-00-10"), false)
    assert.equal(isRealDate("2026-10-00"), false)
    assert.equal(isRealDate(" 2026-10-01"), false)
  })

  it("adds days across months, years and leap days, in UTC", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01")
    assert.equal(addDays("2028-02-28", 1), "2028-02-29")
    assert.equal(addDays("2026-03-01", -1), "2026-02-28")
    assert.equal(addDays("2026-11-20", 14), "2026-12-04")
  })

  it("places a day of the month inside the range, keeping bills on their usual day", () => {
    assert.deepEqual(
      [1, 3, 6, 7, 17, 30, 31].map((day) => dateForDay(november, day)),
      ["2026-12-01", "2026-12-03", "2026-12-06", "2026-11-07", "2026-11-17", "2026-11-30", "2026-11-30"]
    )
    // February with a start on the 30th: the 29th exists in March, the 30th and 31st become Feb 28.
    const february = budgetPeriod("2026-02", 30)
    assert.deepEqual(
      [28, 29, 30, 31, 1].map((day) => dateForDay(february, day)),
      ["2026-02-28", "2026-03-29", "2026-02-28", "2026-02-28", "2026-03-01"]
    )
    // A short range with no such day: the last day of the range.
    const january = budgetPeriod("2026-01", 31)
    assert.deepEqual([30, 28, 31, 1].map((day) => dateForDay(january, day)), ["2026-02-27", "2026-02-27", "2026-01-31", "2026-02-01"])
    assert.equal(dateForDay(budgetPeriod("2026-11", 1), 31), "2026-11-30")
  })

  it("always lands inside the range, for every start day and day of the month", () => {
    for (const month of ["2026-01", "2026-02", "2028-02", "2026-11", "2026-12"]) {
      for (let startDay = 1; startDay <= 31; startDay++) {
        const period = budgetPeriod(month, startDay)
        for (let day = 1; day <= 31; day++) assert.equal(isInPeriod(dateForDay(period, day), period), true, `${month} start ${startDay} day ${day}`)
      }
    }
  })
})

describe("currentBudgetMonth", () => {
  const days = (map: Record<string, number>) => (month: string) => map[month] ?? 1

  it("is the calendar month when budgets start on the 1st", () => {
    assert.equal(currentBudgetMonth("2026-11-01", days({})), "2026-11")
    assert.equal(currentBudgetMonth("2026-11-30", days({})), "2026-11")
  })

  it("is still last month's budget before this month's start day", () => {
    const seventh = days({ "2026-10": 7, "2026-11": 7, "2026-12": 7, "2027-01": 7 })
    assert.equal(currentBudgetMonth("2026-11-06", seventh), "2026-10")
    assert.equal(currentBudgetMonth("2026-11-07", seventh), "2026-11")
    assert.equal(currentBudgetMonth("2027-01-03", seventh), "2026-12")
    assert.equal(currentBudgetMonth("2026-03-30", days({ "2026-02": 31, "2026-03": 31 })), "2026-02")
    assert.equal(currentBudgetMonth("2026-03-31", days({ "2026-02": 31, "2026-03": 31 })), "2026-03")
  })

  it("picks the newer budget where two overlap, and the coming one in a gap", () => {
    assert.equal(currentBudgetMonth("2026-11-03", days({ "2026-10": 15, "2026-11": 1 })), "2026-11")
    assert.equal(currentBudgetMonth("2026-11-03", days({ "2026-10": 15, "2026-11": 5 })), "2026-10")
    assert.equal(currentBudgetMonth("2026-11-03", days({ "2026-10": 1, "2026-11": 7 })), "2026-11")
  })

  it("reads today in local time", () => {
    assert.equal(todayKey(new Date(2026, 10, 7, 23, 59)), "2026-11-07")
    assert.equal(todayKey(new Date(2027, 0, 1, 0, 0)), "2027-01-01")
  })
})
