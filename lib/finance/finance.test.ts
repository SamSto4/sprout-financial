import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { summarizeBudget } from "./budget.ts"
import { normalizeGrowthInputs, projectGrowth } from "./compound.ts"
import { exactDoublingYears, ruleOf72Years } from "./doubling.ts"

// Closed-form future value with monthly compounding and end-of-month contributions.
function futureValue(principal: number, monthly: number, annualPercent: number, years: number) {
  const i = annualPercent / 100 / 12
  const n = years * 12
  if (i === 0) return principal + monthly * n
  return principal * (1 + i) ** n + monthly * (((1 + i) ** n - 1) / i)
}

describe("projectGrowth", () => {
  it("matches the closed-form formula", () => {
    const points = projectGrowth({ principal: 1000, monthlyContribution: 200, annualRatePercent: 6, years: 10 })
    const last = points[points.length - 1]
    assert.equal(points.length, 11)
    assert.ok(Math.abs(last.balance - futureValue(1000, 200, 6, 10)) < 0.01)
  })

  it("tracks contributions and growth separately", () => {
    const points = projectGrowth({ principal: 1000, monthlyContribution: 100, annualRatePercent: 5, years: 3 })
    const last = points[3]
    assert.equal(last.contributed, 1000 + 100 * 36)
    assert.ok(Math.abs(last.contributed + last.growth - last.balance) < 0.02)
    assert.ok(last.growth > 0)
  })

  it("starts at year 0 with the principal", () => {
    const [first] = projectGrowth({ principal: 500, monthlyContribution: 50, annualRatePercent: 7, years: 5 })
    assert.deepEqual(first, { year: 0, contributed: 500, growth: 0, balance: 500 })
  })

  it("has no growth at a 0% rate", () => {
    const points = projectGrowth({ principal: 1000, monthlyContribution: 100, annualRatePercent: 0, years: 2 })
    assert.deepEqual(points[2], { year: 2, contributed: 3400, growth: 0, balance: 3400 })
  })

  it("clamps out-of-range and invalid inputs", () => {
    assert.deepEqual(
      normalizeGrowthInputs({ principal: -5, monthlyContribution: NaN, annualRatePercent: 99, years: 0.4 }),
      { principal: 0, monthlyContribution: 0, annualRatePercent: 15, years: 1 }
    )
  })
})

describe("summarizeBudget", () => {
  it("computes 50/30/20 targets and shares", () => {
    const summary = summarizeBudget(4000, { needs: 2000, wants: 1200, savings: 800 })
    assert.deepEqual(
      summary.lines.map((line) => [line.category, line.target, line.share, line.status]),
      [
        ["needs", 2000, 0.5, "on-track"],
        ["wants", 1200, 0.3, "on-track"],
        ["savings", 800, 0.2, "on-track"],
      ]
    )
    assert.equal(summary.unassigned, 0)
  })

  it("flags overspending and undersaving", () => {
    const summary = summarizeBudget(4000, { needs: 2600, wants: 1400, savings: 0 })
    const status = Object.fromEntries(summary.lines.map((line) => [line.category, line.status]))
    assert.deepEqual(status, { needs: "over", wants: "over", savings: "under" })
    assert.equal(summary.unassigned, 0)
  })

  it("treats small differences as on track", () => {
    const summary = summarizeBudget(4000, { needs: 2050, wants: 1200, savings: 760 })
    assert.ok(summary.lines.every((line) => line.status === "on-track"))
  })

  it("reports money left unassigned or overspent", () => {
    assert.equal(summarizeBudget(3000, { needs: 1000, wants: 500, savings: 500 }).unassigned, 1000)
    assert.equal(summarizeBudget(3000, { needs: 2500, wants: 1000, savings: 0 }).unassigned, -500)
  })

  it("ignores negative or invalid amounts", () => {
    const summary = summarizeBudget(-100, { needs: -5, wants: NaN, savings: 10 })
    assert.equal(summary.income, 0)
    assert.deepEqual(summary.lines.map((line) => line.amount), [0, 0, 10])
    assert.deepEqual(summary.lines.map((line) => line.share), [0, 0, 0])
  })
})

describe("doubling time", () => {
  it("uses 72 divided by the rate", () => {
    assert.equal(ruleOf72Years(6), 12)
    assert.equal(ruleOf72Years(8), 9)
  })

  it("is close to the exact answer for typical rates", () => {
    assert.ok(Math.abs(exactDoublingYears(6) - 11.896) < 0.001)
    for (const rate of [4, 6, 8, 10]) {
      assert.ok(Math.abs(ruleOf72Years(rate) - exactDoublingYears(rate)) < 0.35)
    }
  })

  it("never doubles at 0%", () => {
    assert.equal(ruleOf72Years(0), Infinity)
    assert.equal(exactDoublingYears(0), Infinity)
  })
})
