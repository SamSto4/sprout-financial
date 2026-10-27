import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MAX_MARKET_LOOKUPS_PER_ANSWER, MAX_TOOL_CALLS_PER_ROUND, planToolCalls, skippedToolResult } from "./tool-budget.ts"

describe("planToolCalls", () => {
  it("runs at most eight calls in one round", () => {
    const plan = planToolCalls(Array(20).fill("compound_growth"), 0)
    assert.equal(MAX_TOOL_CALLS_PER_ROUND, 8)
    assert.equal(plan.calls.filter((call) => call === "run").length, 8)
    assert.deepEqual(plan.calls.slice(0, 8), Array(8).fill("run"))
    assert.deepEqual(plan.calls.slice(8), Array(12).fill("round-limit"))
    assert.equal(plan.marketUsed, 0)
  })

  it("stops market lookups at the answer's allowance, counting earlier rounds", () => {
    const plan = planToolCalls(Array(5).fill("check_before_buying"), 7)
    assert.equal(MAX_MARKET_LOOKUPS_PER_ANSWER, 10)
    assert.deepEqual(plan.calls, ["run", "run", "run", "answer-limit", "answer-limit"])
    assert.equal(plan.marketUsed, 10)
  })

  it("keeps the order of a mixed list and still runs other tools once market data is used up", () => {
    const plan = planToolCalls(["get_stock_quote", "compound_growth", "get_company_profile", "search_companies", "create_chart"], 9)
    assert.deepEqual(plan.calls, ["run", "run", "answer-limit", "answer-limit", "run"])
    assert.equal(plan.marketUsed, 10)
  })

  it("lets calls that hit the answer's allowance leave room in the round", () => {
    const plan = planToolCalls([...Array(3).fill("get_stock_quote"), ...Array(8).fill("fee_impact")], 10)
    assert.deepEqual(plan.calls, [...Array(3).fill("answer-limit"), ...Array(8).fill("run")])
  })

  it("hands the round's eight places out in order", () => {
    // Twelve quotes and a budget check: the first eight quotes run, and the rest wait for a later round.
    const plan = planToolCalls([...Array(12).fill("get_stock_quote"), "budget_check"], 0)
    assert.deepEqual(plan.calls.slice(0, 8), Array(8).fill("run"))
    assert.deepEqual(plan.calls.slice(8), Array(5).fill("round-limit"))
    assert.equal(plan.marketUsed, 8)
  })

  it("takes other limits for tests and callers that need them", () => {
    const plan = planToolCalls(["get_stock_quote", "get_stock_quote", "fee_impact"], 0, { perRound: 2, marketPerAnswer: 1 })
    assert.deepEqual(plan.calls, ["run", "answer-limit", "run"])
  })

  it("returns an empty plan for a round with no calls", () => {
    assert.deepEqual(planToolCalls([], 3), { calls: [], marketUsed: 3 })
  })
})

describe("skippedToolResult", () => {
  it("tells the model to answer with what it has", () => {
    assert.match(skippedToolResult("round-limit"), /^Not run: at most 8 tools/)
    assert.match(skippedToolResult("answer-limit"), /10 market data lookups/)
    assert.match(skippedToolResult("answer-limit"), /which ones weren't checked/)
  })
})
