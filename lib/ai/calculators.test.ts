import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { runCalculator } from "./calculators.ts"

function run(name: string, input: unknown) {
  const outcome = runCalculator(name, input)
  assert.ok(outcome)
  return { ...outcome, data: outcome.isError ? null : JSON.parse(outcome.content) }
}

describe("calculator tools", () => {
  it("projects compound growth with milestones", () => {
    const { data } = run("compound_growth", { principal: 0, monthly_contribution: 300, annual_return_percent: 7, years: 30 })
    assert.equal(data.final.contributed, 108_000)
    assert.ok(data.final.balance > 360_000 && data.final.balance < 370_000)
    assert.deepEqual(data.milestones.map((point: { year: number }) => point.year), [5, 10, 15, 20, 25, 30])
    assert.match(data.assumption, /Real returns vary/)
  })

  it("compares two fees", () => {
    const { data } = run("fee_impact", {
      principal: 10_000,
      monthly_contribution: 200,
      annual_return_percent: 7,
      years: 30,
      fee_percent: 1,
      compare_fee_percent: 0.05,
    })
    assert.equal(Math.round(data.withFee.balance), 261_129)
    assert.equal(Math.round(data.compared.balance), 321_564)
    assert.equal(Math.round(data.differenceInEndingBalance), 60_435)
  })

  it("computes doubling time and budget checks", () => {
    assert.equal(run("doubling_time", { annual_return_percent: 8 }).data.ruleOf72Years, 9)
    const budget = run("budget_check", { monthly_income: 4000, needs: 2300, wants: 1100, savings: 600 }).data
    assert.deepEqual(budget.lines.map((line: { status: string }) => line.status), ["over", "on-track", "under"])
  })

  it("rejects bad input without throwing", () => {
    const outcome = run("compound_growth", { principal: -5, monthly_contribution: 1, annual_return_percent: 7, years: 10 })
    assert.equal(outcome.isError, true)
    assert.match(outcome.content, /principal/)
    assert.equal(run("doubling_time", { annual_return_percent: "7" }).isError, true)
  })

  it("ignores tools that aren't calculators", () => {
    assert.equal(runCalculator("get_stock_quote", {}), null)
  })
})
