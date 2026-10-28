import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ChatContext } from "../chat/validate.ts"
import { EMPTY_PROFILE } from "../plan/profile.ts"
import { analyzePortfolio, nextDollars } from "../portfolio/analyze.ts"
import type { Holding } from "../portfolio/holdings.ts"
import { INVESTING_TOOLS, PLAN_TOOLS, runPlanTool } from "./plan-tools.ts"

const holdings: Holding[] = [
  { id: "vti", symbol: "VTI", name: "", assetClass: "us-stocks", value: 9000, shares: null, expenseRatioPercent: 0.03, valueAsOf: "2026-10-20T00:00:00.000Z" },
  { id: "bnd", symbol: "BND", name: "", assetClass: "bonds", value: 1000, shares: null, expenseRatioPercent: 0.03, valueAsOf: "2026-10-21T00:00:00.000Z" },
]
const profile = {
  ...EMPTY_PROFILE,
  updatedAt: "2026-10-25T00:00:00.000Z",
  country: "United States",
  goal: "retirement" as const,
  horizonYears: 40,
  riskAnswers: [2, 2, 2, 2, 2],
  monthlyIncome: 3200,
  monthlyEssentials: 1500,
  emergencySavings: 6000,
  employerMatch: "capturing" as const,
  hasTaxAdvantagedAccount: "yes" as const,
}
const context: ChatContext = { pastChats: [], transactions: [], profile, holdings }
const empty: ChatContext = { pastChats: [], transactions: [], profile: null, holdings: [] }

function parse(result: ReturnType<typeof runPlanTool>) {
  assert.ok(result && !result.isError, result?.content)
  return JSON.parse(result.content)
}

describe("plan tool definitions", () => {
  it("have unique names and say when to use them", () => {
    const names = [...PLAN_TOOLS, ...INVESTING_TOOLS].map((tool) => tool.name)
    assert.equal(new Set(names).size, names.length)
    for (const tool of [...PLAN_TOOLS, ...INVESTING_TOOLS]) assert.ok(tool.description.length > 80, tool.name)
  })
})

describe("runPlanTool", () => {
  it("returns the plan with its roadmap and target range", () => {
    const plan = parse(runPlanTool("get_my_plan", {}, context))
    assert.equal(plan.roadmap.current.id, "invest-more")
    assert.match(plan.targetStockRange, /^75-95%/)
    assert.deepEqual(plan.missing, [])
  })

  it("writes the plan's amounts in the person's currency and says which it is", () => {
    const uk: ChatContext = { ...context, profile: { ...profile, country: "UK", emergencySavings: 400, focus: ["debt"] } }
    const plan = parse(runPlanTool("get_my_plan", {}, uk))
    assert.equal(plan.currency, "GBP")
    assert.equal(plan.countryCode, "GB")
    assert.equal(plan.wantsHelpWith, "paying off debt")
    assert.match(plan.roadmap.nextAction, /£1,100/)
    assert.doesNotMatch(JSON.stringify(plan.roadmap), /\$/)
    const next = parse(runPlanTool("plan_next_dollars", { amount: 500 }, uk))
    assert.match(JSON.stringify(next), /£1,500/)
    assert.doesNotMatch(JSON.stringify(next), /\$/)
    assert.equal(parse(runPlanTool("get_my_plan", {}, context)).currency, "USD")
  })

  it("leaves experience out unless it was chosen", () => {
    assert.equal(parse(runPlanTool("get_my_plan", {}, context)).experience, "not given")
    const chosen: ChatContext = { ...context, profile: { ...profile, experience: "some" } }
    assert.equal(parse(runPlanTool("get_my_plan", {}, chosen)).experience, "I've invested a little")
  })

  it("explains what to do when there's no plan or portfolio", () => {
    assert.equal(runPlanTool("get_my_plan", {}, empty)?.isError, true)
    assert.match(runPlanTool("analyze_my_portfolio", {}, empty)?.content ?? "", /\/portfolio/)
  })

  it("doesn't say there's no plan when About you is off and only holdings are shared", () => {
    const holdingsOnly: ChatContext = { ...empty, aboutYou: false, holdings }
    for (const result of [runPlanTool("get_my_plan", {}, holdingsOnly), runPlanTool("plan_next_dollars", { amount: 200 }, holdingsOnly)]) {
      assert.equal(result?.isError, true)
      assert.match(result?.content ?? "", /isn't shared on this device/)
      assert.doesNotMatch(result?.content ?? "", /hasn't filled in/)
    }
    assert.match(runPlanTool("get_my_plan", {}, { ...empty, aboutYou: true })?.content ?? "", /hasn't filled in their plan/)
  })

  it("analyzes the portfolio against the plan's range and says how old the values are", () => {
    const result = parse(runPlanTool("analyze_my_portfolio", {}, context))
    assert.equal(result.stockShare, 0.9)
    assert.equal(result.target.status, "within")
    assert.equal(result.valuesAsOf, "2026-10-20T00:00:00.000Z")
  })

  it("plans the next dollars with the tested function", () => {
    const result = parse(runPlanTool("plan_next_dollars", { amount: 500 }, context))
    assert.deepEqual(result, nextDollars(500, profile, analyzePortfolio(holdings, { min: 75, max: 95 })))
    assert.equal(runPlanTool("plan_next_dollars", { amount: -5 }, context)?.isError, true)
  })

  it("runs the before-you-buy check with whatever facts it was given", () => {
    const result = parse(runPlanTool("check_before_buying", { symbol: "tsla", amount: 1000 }, context, { symbol: "TSLA", found: true, name: "Tesla" }))
    assert.equal(result.kind, "single-stock")
    assert.equal(result.shareAfter, 0.091)
    assert.equal(runPlanTool("check_before_buying", { symbol: "$$$" }, context)?.isError, true)
  })

  it("gives market drop history, with a stress test when there are holdings", () => {
    const withPortfolio = parse(runPlanTool("market_drop_history", { stock_drop_percent: 40 }, context))
    assert.equal(withPortfolio.yourPortfolio.loss, 3600)
    const without = parse(runPlanTool("market_drop_history", {}, empty))
    assert.equal(typeof without.yourPortfolio, "string")
    assert.ok(without.drops.length >= 5)
  })

  it("ignores tools it doesn't own", () => {
    assert.equal(runPlanTool("compound_growth", {}, context), null)
  })
})
