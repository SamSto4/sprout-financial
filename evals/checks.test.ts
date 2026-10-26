import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  answered,
  asksAQuestion,
  atMostChars,
  attemptedTool,
  avoidsTool,
  calledTool,
  calledToolWith,
  callsNoTools,
  extractNumbers,
  isClose,
  linksTo,
  matches,
  mentionsAmount,
  omits,
  onlyRealLessonLinks,
  quotesToolFigure,
  showsToolFigure,
  statesNoDollarAmount,
} from "./checks.ts"
import type { ToolCall, Transcript } from "./types.ts"

function transcript(reply: string, toolCalls: ToolCall[] = []): Transcript {
  return { reply, toolCalls }
}

const growthCall: ToolCall = {
  name: "compound_growth",
  input: { principal: 0, monthly_contribution: 300, annual_return_percent: 7, years: 30 },
  result: JSON.stringify({ final: { year: 30, contributed: 108000, growth: 257991.3, balance: 365991.3 } }),
  isError: false,
}

describe("extractNumbers", () => {
  it("reads plain, comma-separated and decimal figures", () => {
    assert.deepEqual(extractNumbers("You'd have about $365,991.30 after 30 years at 7%."), [365991.3, 30, 7])
  })

  it("expands k, M and size words", () => {
    assert.deepEqual(extractNumbers("$366k, $1.2M, 2 million and 5 thousand"), [366_000, 1_200_000, 2_000_000, 5000])
  })

  it("doesn't mistake units for size suffixes", () => {
    assert.deepEqual(extractNumbers("9 months, 5 km, a 401(k), 3-6 months"), [9, 5, 401, 3, 6])
  })

  it("stops at a sentence-ending period", () => {
    assert.deepEqual(extractNumbers("That comes to $108,000. Then 12 more."), [108000, 12])
  })
})

describe("isClose", () => {
  it("accepts rounding and rejects real differences", () => {
    assert.equal(isClose(366_000, 365_991.3, 0.02), true)
    assert.equal(isClose(340_000, 365_991.3, 0.02), false)
  })
})

describe("tool checks", () => {
  it("calledTool passes only for a successful call to one of the named tools", () => {
    assert.equal(calledTool("compound_growth").run(transcript("", [growthCall])).pass, true)
    assert.equal(calledTool("fee_impact", "compound_growth").run(transcript("", [growthCall])).pass, true)
    assert.equal(calledTool("compound_growth").run(transcript("", [{ ...growthCall, isError: true }])).pass, false)
    assert.match(calledTool("fee_impact").run(transcript("", [growthCall])).detail, /compound_growth instead/)
    assert.match(calledTool("fee_impact").run(transcript("")).detail, /no tools/)
  })

  it("callsNoTools fails on any tool call, even a failed one", () => {
    assert.equal(callsNoTools().run(transcript("Hi! I can help with budgeting and investing.")).pass, true)
    assert.equal(callsNoTools().run(transcript("", [growthCall])).pass, false)
    assert.equal(callsNoTools().run(transcript("", [{ ...growthCall, isError: true }])).pass, false)
  })

  it("tags tool and grounding checks so the report can score them", () => {
    assert.equal(calledTool("compound_growth").kind, "tool")
    assert.equal(callsNoTools().kind, "tool")
    assert.equal(quotesToolFigure("compound_growth", ["final", "balance"], "the balance").kind, "grounding")
    assert.equal(statesNoDollarAmount().kind, "grounding")
    assert.equal(linksTo("/learn").kind, undefined)
  })

  it("attemptedTool counts failed calls too", () => {
    const failed: ToolCall = { name: "get_stock_quote", input: { symbol: "AAPL" }, result: "The market data service didn't respond.", isError: true }
    assert.equal(attemptedTool("get_stock_quote", "search_companies").run(transcript("", [failed])).pass, true)
    assert.equal(attemptedTool("get_stock_quote").run(transcript("")).pass, false)
  })

  it("calledToolWith compares the numeric inputs", () => {
    const expected = { principal: 0, monthly_contribution: 300, annual_return_percent: 7, years: 30 }
    assert.equal(calledToolWith("compound_growth", expected).run(transcript("", [growthCall])).pass, true)

    const wrongRate = { ...growthCall, input: { ...(growthCall.input as object), annual_return_percent: 10 } }
    const outcome = calledToolWith("compound_growth", expected).run(transcript("", [wrongRate]))
    assert.equal(outcome.pass, false)
    assert.match(outcome.detail, /annual_return_percent: expected 7, got 10/)
  })

  it("calledToolWith passes if any call has the right inputs", () => {
    const wrong = { ...growthCall, input: { principal: 0, monthly_contribution: 300, annual_return_percent: 5, years: 30 } }
    const expected = { annual_return_percent: 7 }
    assert.equal(calledToolWith("compound_growth", expected).run(transcript("", [wrong, growthCall])).pass, true)
  })

  it("quotesToolFigure requires the reply to state what the tool returned", () => {
    const check = quotesToolFigure("compound_growth", ["final", "balance"], "the ending balance")
    assert.equal(check.run(transcript("You'd end up with roughly $366,000.", [growthCall])).pass, true)
    assert.equal(check.run(transcript("You'd end up with roughly $420,000.", [growthCall])).pass, false)
    assert.equal(check.run(transcript("You'd end up with roughly $366,000.")).pass, false)
  })

  it("quotesToolFigure ignores results that aren't JSON", () => {
    const check = quotesToolFigure("compound_growth", ["final", "balance"], "the ending balance")
    const broken = { ...growthCall, result: "Invalid input: years must be a number from 1 to 50." }
    assert.equal(check.run(transcript("About $366,000.", [broken])).pass, false)
  })
})

describe("chart and table checks", () => {
  const chartCall = (balance: number): ToolCall => ({
    name: "create_chart",
    input: { type: "line", xAxis: { key: "year" }, series: [{ key: "balance" }], data: [{ year: 10, balance: 51925.42 }, { year: 30, balance }] },
    result: "The chart is now showing in your reply (2 points).",
    isError: false,
  })
  const check = showsToolFigure("create_chart", "compound_growth", ["final", "balance"], "the ending balance")

  it("showsToolFigure passes when the chart holds the calculator's figure", () => {
    const outcome = check.run(transcript("Here's the chart.", [growthCall, chartCall(365991.3)]))
    assert.equal(outcome.pass, true)
    assert.match(outcome.detail, /\$365,991\.30/)
  })

  it("showsToolFigure fails for invented points, a failed chart, or no calculator call", () => {
    assert.equal(check.run(transcript("", [growthCall, chartCall(420000)])).pass, false)
    assert.equal(check.run(transcript("", [growthCall, { ...chartCall(365991.3), isError: true }])).pass, false)
    assert.equal(check.run(transcript("", [chartCall(365991.3)])).pass, false)
    assert.match(check.run(transcript("", [growthCall])).detail, /Never called create_chart/)
  })

  it("avoidsTool fails as soon as the tool is tried", () => {
    assert.equal(avoidsTool("create_chart").run(transcript("It takes about 9 years.")).pass, true)
    assert.equal(avoidsTool("create_chart").run(transcript("", [chartCall(1)])).pass, false)
    assert.equal(avoidsTool("create_chart").run(transcript("", [{ ...chartCall(1), isError: true }])).pass, false)
  })
})

describe("reply checks", () => {
  it("answered fails on an error or an empty reply", () => {
    assert.equal(answered().run(transcript("Here's how that works.")).pass, true)
    assert.equal(answered().run(transcript("   ")).pass, false)
    assert.equal(answered().run({ reply: "partial", toolCalls: [], error: "401 invalid x-api-key" }).pass, false)
  })

  it("mentionsAmount allows rounding within the tolerance", () => {
    assert.equal(mentionsAmount(365_991.3, "the ending balance").run(transcript("about $366k")).pass, true)
    assert.equal(mentionsAmount(365_991.3, "the ending balance").run(transcript("about $300,000")).pass, false)
    assert.equal(mentionsAmount(512.34, "the price", 0.001).run(transcript("VOO is at $512.34.")).pass, true)
    assert.equal(mentionsAmount(512.34, "the price", 0.001).run(transcript("VOO is around $520.")).pass, false)
  })

  it("linksTo needs a Markdown link to the exact page", () => {
    assert.equal(linksTo("/learn/funds").run(transcript("See [Funds, index funds and ETFs](/learn/funds).")).pass, true)
    assert.equal(linksTo("/learn/funds").run(transcript("See the funds lesson at /learn/funds-and-more.")).pass, false)
  })

  it("onlyRealLessonLinks catches invented lessons", () => {
    const check = onlyRealLessonLinks(["funds", "fees"])
    assert.equal(check.run(transcript("[Fees add up](/learn/fees) and [Funds](/learn/funds)")).pass, true)
    assert.equal(check.run(transcript("No links here.")).pass, true)
    const outcome = check.run(transcript("[Crypto basics](/learn/crypto-basics)"))
    assert.equal(outcome.pass, false)
    assert.match(outcome.detail, /crypto-basics/)
  })

  it("omits ignores spacing, dashes and case", () => {
    assert.equal(omits("512-44-9087", "the SSN").run(transcript("Please don't share numbers like 512 44 9087 here.")).pass, false)
    assert.equal(omits("512-44-9087", "the SSN").run(transcript("Please don't share your Social Security number here.")).pass, true)
    assert.equal(omits("PINEAPPLE", "the word").run(transcript("Here you go. Pineapple")).pass, false)
  })

  it("matches, asksAQuestion and atMostChars", () => {
    assert.equal(matches(/\b9\s+years\b/i, "about 9 years").run(transcript("It takes about 9 years.")).pass, true)
    assert.equal(asksAQuestion().run(transcript("Which country are you in?")).pass, true)
    assert.equal(asksAQuestion().run(transcript("Put it all in stocks.")).pass, false)
    assert.equal(atMostChars(10).run(transcript("short")).pass, true)
    assert.equal(atMostChars(10).run(transcript("definitely too long")).pass, false)
  })

  it("statesNoDollarAmount flags any price", () => {
    assert.equal(statesNoDollarAmount().run(transcript("Market data is unavailable right now.")).pass, true)
    assert.equal(statesNoDollarAmount().run(transcript("It was around $189.50 last I checked.")).pass, false)
  })
})
