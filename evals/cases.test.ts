import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CALCULATOR_TOOLS, runCalculator } from "../lib/ai/calculators.ts"
import { CHART_TOOL, runSkillTool, TABLE_TOOL } from "../lib/ai/skill-tools.ts"
import { validateChatRequest } from "../lib/chat/validate.ts"
import { LESSONS } from "../lib/learn/course.ts"
import { CASES } from "./cases.ts"
import { CATEGORIES } from "./types.ts"

// Structural checks on the eval set itself, so a typo in a case can't quietly weaken the suite.
describe("eval cases", () => {
  it("have unique kebab-case ids", () => {
    const ids = CASES.map((evalCase) => evalCase.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("cover every category", () => {
    for (const category of CATEGORIES) {
      assert.ok(CASES.some((evalCase) => evalCase.category === category), `no ${category} cases`)
    }
  })

  it("each test something and say what", () => {
    for (const evalCase of CASES) {
      assert.ok((evalCase.checks?.length ?? 0) + (evalCase.rubric?.length ?? 0) > 0, `${evalCase.id} has no checks`)
      assert.ok(evalCase.purpose.trim().length > 10, `${evalCase.id} has no purpose`)
      for (const criterion of evalCase.rubric ?? []) assert.ok(criterion.trim().endsWith("."), `${evalCase.id}: "${criterion}"`)
    }
  })

  it("send conversations the chat route would accept, unchanged", () => {
    for (const evalCase of CASES) {
      const request = validateChatRequest({
        messages: evalCase.messages,
        context: { transactions: evalCase.transactions ?? [], pastChats: evalCase.pastChats ?? [] },
      })
      assert.ok(request.ok, `${evalCase.id}: ${request.ok ? "" : request.error}`)
      assert.deepEqual(request.messages, evalCase.messages, evalCase.id)
      assert.equal(request.context.transactions.length, evalCase.transactions?.length ?? 0, evalCase.id)
      assert.deepEqual(request.context.pastChats, evalCase.pastChats ?? [], evalCase.id)
    }
  })

  it("only link to lessons that exist", () => {
    const slugs = LESSONS.map((lesson) => lesson.slug)
    for (const evalCase of CASES) {
      for (const check of evalCase.checks ?? []) {
        const linked = check.label.match(/^Links to \/learn\/(.+)$/)
        if (linked) assert.ok(slugs.includes(linked[1]), `${evalCase.id} expects a link to a missing lesson: ${linked[1]}`)
      }
    }
  })

  it("only name tools that exist", () => {
    const known = [
      ...CALCULATOR_TOOLS.map((tool) => tool.name),
      CHART_TOOL.name,
      TABLE_TOOL.name,
      "search_past_chats",
      "read_past_chat",
      "get_stock_quote",
      "search_companies",
      "get_company_profile",
      "get_finance_summary",
      "get_spending_trends",
      "find_transactions",
    ]
    for (const evalCase of CASES) {
      for (const check of evalCase.checks ?? []) {
        const named =
          check.label.match(/^(?:Uses the|Tries the|Doesn't use the) (.+) tool$/) ??
          check.label.match(/^Passes the user's numbers to (.+)$/)
        const shown = check.label.match(/^Puts .+ from (\S+) into (\S+)$/)
        for (const tool of [...(named ? named[1].split(" or ") : []), ...(shown ? [shown[1], shown[2]] : [])]) {
          assert.ok(known.includes(tool), `${evalCase.id} names an unknown tool: ${tool}`)
        }
      }
    }
  })

  it("pass a reply that repeats the calculator's real output, and fail one that doesn't", () => {
    // Ties the expected figures in cases.ts to the tools the agent really calls: if lib/finance
    // or a case's numbers drift apart, a faithful answer would stop passing and this fails first.
    const scenarios = [
      {
        id: "projection-monthly-savings",
        tool: "compound_growth",
        input: { principal: 0, monthly_contribution: 300, annual_return_percent: 7, years: 30 },
        figure: (data: { final: { balance: number } }) => data.final.balance,
      },
      {
        id: "projection-lump-sum-plus-monthly",
        tool: "compound_growth",
        input: { principal: 5000, monthly_contribution: 150, annual_return_percent: 6, years: 20 },
        figure: (data: { final: { balance: number } }) => data.final.balance,
      },
      {
        id: "fee-comparison",
        tool: "fee_impact",
        input: { principal: 10_000, monthly_contribution: 200, annual_return_percent: 7, years: 30, fee_percent: 1, compare_fee_percent: 0.05 },
        figure: (data: { differenceInEndingBalance: number }) => data.differenceInEndingBalance,
      },
    ]

    for (const scenario of scenarios) {
      const evalCase = CASES.find((item) => item.id === scenario.id)
      assert.ok(evalCase?.checks, scenario.id)
      const outcome = runCalculator(scenario.tool, scenario.input)
      assert.ok(outcome && !outcome.isError, scenario.id)
      const figure = scenario.figure(JSON.parse(outcome.content))
      const toolCalls = [{ name: scenario.tool, input: scenario.input, result: outcome.content, isError: false }]

      const faithful = { reply: `That comes to $${figure.toFixed(2)}, assuming a steady return.`, toolCalls }
      for (const check of evalCase.checks) assert.equal(check.run(faithful).pass, true, `${scenario.id}: ${check.label}`)

      const invented = { reply: `That comes to $${(figure * 1.25).toFixed(2)}.`, toolCalls }
      assert.ok(evalCase.checks.some((check) => !check.run(invented).pass), `${scenario.id} accepted an invented figure`)
    }
  })

  it("pass a chart or table built from the calculator's output, and fail one with invented points", () => {
    const scenarios = [
      {
        id: "chart-from-calculator",
        display: "create_chart",
        input: { principal: 0, monthly_contribution: 300, annual_return_percent: 7, years: 30 },
        build: (points: { year: number; balance: number }[]) => ({
          type: "line",
          title: "Growth",
          xAxis: { key: "year" },
          series: [{ key: "balance" }],
          data: points,
        }),
      },
      {
        id: "table-from-calculator",
        display: "create_table",
        input: { principal: 0, monthly_contribution: 200, annual_return_percent: 6, years: 10 },
        build: (points: { year: number; balance: number }[]) => ({
          columns: [
            { key: "year", label: "Year", format: "number" },
            { key: "balance", label: "Balance", format: "money" },
          ],
          rows: points,
        }),
      },
    ]

    for (const scenario of scenarios) {
      const evalCase = CASES.find((item) => item.id === scenario.id)
      assert.ok(evalCase?.checks, scenario.id)
      const calculated = runCalculator("compound_growth", scenario.input)
      assert.ok(calculated && !calculated.isError, scenario.id)
      const milestones: { year: number; balance: number }[] = JSON.parse(calculated.content).milestones
      const growthCall = { name: "compound_growth", input: scenario.input, result: calculated.content, isError: false }

      const transcriptWith = (points: { year: number; balance: number }[]) => {
        const input = scenario.build(points.map(({ year, balance }) => ({ year, balance })))
        const shown = runSkillTool(scenario.display, input)
        assert.ok(shown && !shown.isError, `${scenario.id}: ${shown?.content}`)
        return { reply: "Here it is.", toolCalls: [growthCall, { name: scenario.display, input, result: shown.content, isError: false }] }
      }

      const faithful = transcriptWith(milestones)
      for (const check of evalCase.checks) assert.equal(check.run(faithful).pass, true, `${scenario.id}: ${check.label}`)

      const invented = transcriptWith(milestones.map((point) => ({ ...point, balance: Math.round(point.balance * 1.3) })))
      assert.ok(evalCase.checks.some((check) => !check.run(invented).pass), `${scenario.id} accepted invented points`)
    }
  })
})
