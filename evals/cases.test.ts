import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CALCULATOR_TOOLS, runCalculator } from "../lib/ai/calculators.ts"
import { INVESTING_TOOLS, PLAN_TOOLS } from "../lib/ai/plan-tools.ts"
import { CHART_TOOL, runSkillTool, TABLE_TOOL } from "../lib/ai/skill-tools.ts"
import { redactSensitiveNumbers } from "../lib/chat/redact.ts"
import { validateChatRequest } from "../lib/chat/validate.ts"
import { LESSONS } from "../lib/learn/course.ts"
import { buildAboutCard } from "../lib/plan/about-card.ts"
import { extractNumbers } from "./checks.ts"
import { CASES, INJECTED_COUNTRY } from "./cases.ts"
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

  it("send conversations the chat route would accept, unchanged apart from masked card and ID numbers", () => {
    for (const evalCase of CASES) {
      const request = validateChatRequest(
        {
          messages: evalCase.messages,
          context: {
            transactions: evalCase.transactions ?? [],
            pastChats: evalCase.pastChats ?? [],
            profile: evalCase.profile ?? null,
            holdings: evalCase.holdings ?? [],
            aboutYou: evalCase.aboutYou ?? evalCase.profile != null,
            completedLessons: evalCase.completedLessons ?? [],
          },
        },
        { lessonSlugs: LESSONS.map((lesson) => lesson.slug) }
      )
      assert.ok(request.ok, `${evalCase.id}: ${request.ok ? "" : request.error}`)
      // The route masks card, account and ID numbers the user typed (lib/chat/redact.ts), so the
      // cases that share one test the agent with what it really receives.
      const expected = evalCase.messages.map((message) =>
        message.role === "user" ? { ...message, content: redactSensitiveNumbers(message.content).text } : message
      )
      assert.deepEqual(request.messages, expected, evalCase.id)
      assert.equal(request.context.transactions.length, evalCase.transactions?.length ?? 0, evalCase.id)
      assert.deepEqual(request.context.pastChats, evalCase.pastChats ?? [], evalCase.id)
      // Finished lessons reach the agent only with About you on, and only the course's own slugs.
      assert.deepEqual(request.context.completedLessons, evalCase.completedLessons ?? [], `${evalCase.id}: lessons the route would drop`)
    }
  })

  it("test the agent's own discretion with a number that reaches it unmasked, as well as the masking", () => {
    const sent = (id: string) => {
      const evalCase = CASES.find((candidate) => candidate.id === id)
      assert.ok(evalCase, id)
      return redactSensitiveNumbers(evalCase.messages.at(-1)?.content ?? "")
    }
    // These two are masked before the agent sees them, so their omits() checks guard the masking.
    assert.equal(sent("asked-to-move-money").masked, 1)
    assert.ok(!sent("asked-to-move-money").text.includes("4417 2290 8831"))
    assert.equal(sent("shares-social-security-number").masked, 1)
    // This one isn't, so its omits() check can fail if the agent repeats the number.
    assert.equal(sent("checking-account-number-unmasked").masked, 0)
    assert.ok(sent("checking-account-number-unmasked").text.includes("44172290883"))
  })

  it("give the agent the About the user summary their checks rely on, built from what the route accepts", () => {
    const lessons = LESSONS.map(({ slug, title }) => ({ slug, title }))
    const card = (id: string) => {
      const evalCase = CASES.find((candidate) => candidate.id === id)
      assert.ok(evalCase, id)
      const request = validateChatRequest(
        {
          messages: evalCase.messages,
          context: {
            profile: evalCase.profile ?? null,
            aboutYou: evalCase.aboutYou ?? evalCase.profile != null,
            completedLessons: evalCase.completedLessons ?? [],
          },
        },
        { lessonSlugs: LESSONS.map((lesson) => lesson.slug) }
      )
      assert.ok(request.ok, id)
      const built = buildAboutCard({ profile: request.context.profile, completedLessons: request.context.completedLessons ?? [], lessons })
      return { text: built.text, evalCase }
    }

    // The range the case looks for is the one the summary gives, so no plan lookup is needed.
    const saves = card("about-card-saves-a-round")
    const range = saves.evalCase.checks?.find((check) => check.label.startsWith("States the plan's target stock range"))
    const [min, max] = range?.label.match(/\((\d+)-(\d+)%\)/)?.slice(1) ?? []
    assert.ok(min && saves.text.includes(`target ${min}-${max}% in stocks`), saves.text)
    assert.match(saves.text, /Country: United States/)

    // A focus alone: no roadmap, so nothing to fetch.
    const focus = card("focus-only-no-plan-round").text
    assert.match(focus, /Wants help with: paying off debt/)
    assert.doesNotMatch(focus, /Money roadmap|Risk level/)

    const uk = card("currency-from-country").text
    assert.match(uk, /Country: United Kingdom \(amounts in GBP\)/)

    // The funds lesson is named as finished (not just counted), so the agent knows it was done.
    const lessonCase = card("finished-lesson-builds-on-it")
    assert.match(lessonCase.text, /Finished lessons: 6 .*Funds, index funds and ETFs/)
    assert.match(lessonCase.text, /Next unfinished lesson: \[[^\]]+\]\(\/learn\/starting-early\)/)

    // The injected country is there, but only as quoted text.
    const injected = card("prompt-injection-in-country").text
    assert.ok(injected.includes(JSON.stringify(INJECTED_COUNTRY)), injected)
    assert.ok(!injected.replace(JSON.stringify(INJECTED_COUNTRY), "").includes("TSLA"), injected)

    // The search case's figures aren't in the summary, so any that reach a query came from get_my_plan.
    const search = card("search-privacy-with-summary")
    const figures = extractNumbers(search.text)
    for (const value of [4137, 2291, 15283]) assert.ok(!figures.includes(value), `${value} is in the summary`)
    assert.match(search.text, /amounts in GBP/)
  })

  it("search the web in only a few cases, since each search is billed and results change", () => {
    const searching = CASES.filter((evalCase) => evalCase.webSearch)
    assert.ok(searching.length <= 3, searching.map((evalCase) => evalCase.id).join(", "))
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
      ...PLAN_TOOLS.map((tool) => tool.name),
      ...INVESTING_TOOLS.map((tool) => tool.name),
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
