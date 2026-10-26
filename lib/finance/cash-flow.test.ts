import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { BUDGET_ITEMS, groupBudget, ITEM_GROUP, summarizeBudget } from "./budget.ts"
import { budgetForMonth, parseSavedBudgets, saveMonthBudget } from "./budget-history.ts"
import {
  buildCashFlow,
  dateFor,
  dayInMonth,
  daysInMonth,
  MAX_BILLS,
  moveSchedule,
  parseSchedule,
  totalPaychecks,
  type MonthSchedule,
} from "./cash-flow.ts"

const OCT = "2026-10"
const now = new Date("2026-10-26T09:00:00Z")

// Paid on the 3rd and the 19th this month; rent is due on the 1st.
const october: MonthSchedule = {
  startingBalance: 400,
  paychecks: [
    { id: "p-1", date: "2026-10-19", amount: 1500, label: "Second paycheck" },
    { id: "p-2", date: "2026-10-03", amount: 1500, label: "First paycheck" },
  ],
  bills: [
    { id: "b-rent", date: "2026-10-01", amount: 1200, label: "Rent", category: "needs" },
    { id: "b-phone", date: "2026-10-02", amount: 60, label: "Phone", category: "recurring" },
    { id: "b-card", date: "2026-10-19", amount: 300, label: "Credit card", category: "needs" },
    { id: "b-gym", date: "2026-10-25", amount: 40, label: "Gym", category: "recurring" },
  ],
}

describe("buildCashFlow", () => {
  it("runs the month in date order and totals it", () => {
    const flow = buildCashFlow(october)
    assert.deepEqual(flow.events.map((event) => event.label), ["Rent", "Phone", "First paycheck", "Second paycheck", "Credit card", "Gym"])
    assert.equal(flow.moneyIn, 3000)
    assert.equal(flow.billsOut, 1600)
    assert.equal(flow.endBalance, 1800) // 400 + 3,000 − 1,600
  })

  it("flags a bill due before the paycheck that covers it, with how short and when pay arrives", () => {
    const flow = buildCashFlow(october)
    assert.equal(flow.shortfalls.length, 1)
    const [shortfall] = flow.shortfalls
    assert.equal(shortfall.bill.label, "Rent")
    assert.equal(shortfall.short, 860) // 400 − 1,200 = −800, then the phone bill: −860
    assert.equal(shortfall.nextPaycheck?.date, "2026-10-03")
    assert.deepEqual(flow.lowest, { balance: -860, date: "2026-10-02" })
  })

  it("counts a paycheck before a bill on the same day (direct deposit arrives first)", () => {
    const flow = buildCashFlow({
      startingBalance: 0,
      paychecks: [{ id: "p", date: "2026-10-15", amount: 1000, label: "Pay" }],
      bills: [{ id: "b", date: "2026-10-15", amount: 900, label: "Rent", category: "needs" }],
    })
    assert.equal(flow.shortfalls.length, 0)
    assert.deepEqual(flow.events.map((event) => event.kind), ["paycheck", "bill"])
  })

  it("reports a second dip separately, and none when money is always there", () => {
    const twice = buildCashFlow({
      startingBalance: 0,
      paychecks: [{ id: "p", date: "2026-10-10", amount: 500, label: "Pay" }],
      bills: [
        { id: "a", date: "2026-10-05", amount: 100, label: "A", category: "needs" },
        { id: "b", date: "2026-10-20", amount: 600, label: "B", category: "needs" },
      ],
    })
    assert.deepEqual(twice.shortfalls.map((shortfall) => [shortfall.bill.label, shortfall.short, shortfall.nextPaycheck?.label ?? null]), [["A", 100, "Pay"], ["B", 200, null]])
    assert.equal(buildCashFlow({ ...october, startingBalance: 2000 }).shortfalls.length, 0)
  })

  it("handles an empty month", () => {
    const flow = buildCashFlow({ startingBalance: 250, paychecks: [], bills: [] })
    assert.deepEqual([flow.events.length, flow.endBalance, flow.lowest, flow.shortfalls.length], [0, 250, null, 0])
  })
})

describe("buildCashFlow: dips a paycheck doesn't cover (security review)", () => {
  it("keeps a shortfall going until a paycheck brings the balance back, and names every bill in it", () => {
    const flow = buildCashFlow({
      startingBalance: 0,
      paychecks: [
        { id: "small", date: "2026-01-10", amount: 100, label: "Small" },
        { id: "big", date: "2026-01-20", amount: 2000, label: "Big" },
      ],
      bills: [
        { id: "rent", date: "2026-01-05", amount: 500, label: "Rent", category: "needs" },
        { id: "car", date: "2026-01-15", amount: 1000, label: "Car", category: "needs" },
      ],
    })
    assert.equal(flow.shortfalls.length, 1)
    const [dip] = flow.shortfalls
    assert.deepEqual(dip.bills.map((bill) => bill.label), ["Rent", "Car"])
    assert.equal(dip.short, 1400) // 0 − 500 + 100 − 1,000
    assert.equal(dip.short, -flow.lowest!.balance)
    assert.equal(dip.nextPaycheck?.label, "Big") // "Small" doesn't bring it back above zero
  })

  it("says no paycheck covers it when none does this month", () => {
    const flow = buildCashFlow({
      startingBalance: 0,
      paychecks: [{ id: "p", date: "2026-01-10", amount: 100, label: "Pay" }],
      bills: [{ id: "r", date: "2026-01-05", amount: 500, label: "Rent", category: "needs" }],
    })
    assert.equal(flow.shortfalls[0].nextPaycheck, null)
    assert.equal(flow.shortfalls[0].short, 500)
  })
})

describe("parseSchedule: crafted input (security review)", () => {
  it("reads a huge label in a crafted request without spending real time on it", () => {
    const huge = "a ".repeat(2_000_000)
    const start = performance.now()
    const parsed = parseSchedule({ bills: Array.from({ length: MAX_BILLS }, (_, i) => ({ id: `b${i}`, date: "2026-10-01", amount: 1, label: huge })) }, OCT)
    assert.ok(performance.now() - start < 100, `took ${Math.round(performance.now() - start)} ms`)
    assert.equal(Array.from(parsed!.bills[0].label).length, 60)
  })

  it("never cuts an emoji in half", () => {
    const parsed = parseSchedule({ bills: [{ date: "2026-10-01", amount: 1, label: "x".repeat(59) + "🏠🏠" }] }, OCT)
    assert.equal(parsed?.bills[0].label, "x".repeat(59) + "🏠")
  })

  it("gives every entry its own id, even when a request repeats or collides with them", () => {
    const parsed = parseSchedule(
      { bills: [{ id: "b-2", date: "2026-10-01", amount: 1 }, { date: "2026-10-01", amount: 1 }, { id: "dup", date: "2026-10-01", amount: 1 }, { id: "dup", date: "2026-10-01", amount: 1 }] },
      OCT
    )
    const ids = parsed!.bills.map((bill) => bill.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.equal(ids[0], "b-2")
  })

  it("caps income from paychecks like any other amount", () => {
    const paychecks = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, date: "2026-10-01", amount: 10_000_000, label: "" }))
    assert.equal(totalPaychecks({ startingBalance: 0, paychecks, bills: [] }), 10_000_000)
  })
})

describe("dates", () => {
  it("knows month lengths, including leap years", () => {
    assert.deepEqual([daysInMonth("2026-02"), daysInMonth("2028-02"), daysInMonth("2026-10"), daysInMonth("2026-11")], [28, 29, 31, 30])
  })

  it("only accepts real dates inside the month", () => {
    assert.equal(dayInMonth("2026-10-31", OCT), 31)
    for (const bad of ["2026-11-01", "2026-10-32", "2026-10-00", "10/05/2026", "", null, 5]) assert.equal(dayInMonth(bad, OCT), null, String(bad))
  })

  it("moves a schedule to the same days of another month, clamping to shorter months", () => {
    const moved = moveSchedule({ startingBalance: 0, paychecks: [{ id: "p", date: "2026-10-31", amount: 1, label: "" }], bills: [] }, "2026-11")
    assert.equal(moved.paychecks[0].date, "2026-11-30")
    assert.equal(dateFor("2026-02", 30), "2026-02-28")
  })
})

describe("parseSchedule", () => {
  it("drops entries outside the month or without an amount, and caps the lists", () => {
    const parsed = parseSchedule(
      {
        startingBalance: -50,
        paychecks: [
          { id: "ok", date: "2026-10-05", amount: 100, label: "  Pay   day " },
          { date: "2026-09-30", amount: 100 },
          { date: "2026-10-06", amount: "lots" },
        ],
        bills: Array.from({ length: MAX_BILLS + 5 }, (_, i) => ({ id: `b${i}`, date: "2026-10-10", amount: 1, category: i === 0 ? "not-a-line" : "groceries" })),
      },
      OCT
    )
    assert.ok(parsed)
    assert.equal(parsed.startingBalance, 0)
    // Inner spaces collapse and leading ones go; a trailing space stays so typing "Pay day" works.
    assert.deepEqual(parsed.paychecks, [{ id: "ok", date: "2026-10-05", amount: 100, label: "Pay day " }])
    assert.equal(parsed.bills.length, MAX_BILLS)
    assert.equal(parsed.bills[0].category, "needs") // unknown line falls back to needs
    assert.equal(parsed.bills[1].category, "groceries")
  })

  it("rejects ids that could become query operators, and returns null for nothing", () => {
    const parsed = parseSchedule({ paychecks: [{ id: "$where", date: "2026-10-01", amount: 5 }] }, OCT)
    assert.equal(parsed?.paychecks[0].id, "p-1")
    assert.equal(parseSchedule({}, OCT), null)
    assert.equal(parseSchedule("nope", OCT), null)
  })
})

describe("budget lines and the 50/30/20 groups", () => {
  it("groups every line into needs, wants or savings", () => {
    assert.equal(BUDGET_ITEMS.length, 7)
    assert.deepEqual(groupBudget({ needs: 1000, groceries: 400, recurring: 50, wants: 300, misc: 100, savings: 200, investments: 300 }), {
      needs: 1400,
      wants: 450,
      savings: 500,
    })
    assert.equal(ITEM_GROUP.investments, "savings")
    assert.equal(ITEM_GROUP.groceries, "needs")
  })

  it("compares the grouped totals with the guideline, as before", () => {
    const summary = summarizeBudget(4000, groupBudget({ needs: 1800, groceries: 500, recurring: 120, wants: 780, misc: 200, savings: 300, investments: 300 }))
    assert.deepEqual(summary.lines.map((line) => [line.category, line.amount, line.status]), [["needs", 2300, "over"], ["wants", 1100, "on-track"], ["savings", 600, "under"]])
  })
})

describe("saving a month with dates", () => {
  const lines = { needs: 1200, groceries: 400, recurring: 100, wants: 500, misc: 100, savings: 300, investments: 400 }

  it("takes income from the paychecks, so the two can't disagree", () => {
    const saved = saveMonthBudget(null, OCT, { income: 99, ...lines, schedule: october }, now)
    assert.equal(saved.months[OCT].income, totalPaychecks(october))
    assert.equal(budgetForMonth(saved, OCT).schedule?.bills.length, 4)
  })

  it("keeps the typed income when no paychecks are entered", () => {
    const saved = saveMonthBudget(null, OCT, { income: 3100, ...lines, schedule: { startingBalance: 200, paychecks: [], bills: october.bills } }, now)
    assert.equal(saved.months[OCT].income, 3100)
  })

  it("starts next month from this month's schedule, moved to the same days", () => {
    const saved = saveMonthBudget(null, OCT, { income: 0, ...lines, schedule: october }, now)
    const november = budgetForMonth(saved, "2026-11")
    assert.equal(november.source, "carried")
    assert.deepEqual(november.schedule?.paychecks.map((paycheck) => paycheck.date).sort(), ["2026-11-03", "2026-11-19"])
  })

  it("survives sync: the schedule is checked by the same parser on the way in", () => {
    const saved = saveMonthBudget(null, OCT, { income: 0, ...lines, schedule: october }, now)
    const roundTrip = parseSavedBudgets(JSON.parse(JSON.stringify(saved)))
    assert.deepEqual(roundTrip?.months[OCT], saved.months[OCT])
    const tampered = parseSavedBudgets({ ...saved, months: { [OCT]: { ...saved.months[OCT], schedule: { bills: [{ date: "2099-01-01", amount: 5 }] } } } })
    assert.equal(tampered?.months[OCT].schedule, undefined)
  })

  it("leaves months without dates exactly as they were", () => {
    const saved = saveMonthBudget(null, OCT, { income: 3000, ...lines }, now)
    assert.equal("schedule" in saved.months[OCT], false)
  })
})
