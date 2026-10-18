// Runs the eval suite: asks the real agent every question in evals/cases.ts, checks each answer,
// and writes a report to evals/results/.
//
//   npm run eval                          every case, once
//   npm run eval -- --filter safety       only cases whose id or category contains "safety"
//   npm run eval -- --runs 3              each case three times, to see how consistent answers are
//   npm run eval -- --list                print the cases without calling the API
//   npm run eval -- --out sonnet          write evals/results/sonnet.md instead of latest.md, to
//                                         compare models: set ANTHROPIC_MODEL for the run and keep
//                                         EVAL_GRADER_MODEL the same across runs
//
// This calls the Anthropic API (the agent, then a grader, per case), so it needs CLAUDE_API_KEY and
// uses credits. It runs the same code path as /api/chat: request validation, then
// streamAgentReply with the production system prompt and tools. Market data is replaced by a
// fixture and web search is switched off, so runs are repeatable and nothing else is billed.

import { mkdirSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { streamAgentReply } from "@/lib/ai/agent"
import { createClient, fallbackOptions, isAgentConfigured, MODEL } from "@/lib/ai/client"

import { compactArtifacts } from "../lib/ai/artifacts.ts"
import { validateChatRequest } from "../lib/chat/validate.ts"
import { LESSONS } from "../lib/learn/course.ts"
import { CASES } from "./cases.ts"
import { answered, onlyRealLessonLinks } from "./checks.ts"
import { setMarketMode } from "./fixtures.ts"
import { buildJudgeMessage, failAll, JUDGE_SCHEMA, JUDGE_SYSTEM, parseVerdicts } from "./judge.ts"
import { percent, renderMarkdown, summarize, type RunInfo } from "./score.ts"
import type { CaseResult, CheckResult, EvalCase, MarketMode, Transcript } from "./types.ts"

/** The model that grades replies. A different, stronger model than the default agent, so it does
 * not grade its own style; set EVAL_GRADER_MODEL to use another. */
const GRADER_MODEL = process.env.EVAL_GRADER_MODEL || "claude-sonnet-5-5"
const CASE_TIMEOUT_MS = 180_000
const OUTPUT_DIR = new URL("./results/", import.meta.url)

type Options = { filter: string; runs: number; concurrency: number; minPass: number; list: boolean; out: string }

function readOptions(): Options {
  const { values } = parseArgs({
    options: {
      filter: { type: "string", default: "" },
      runs: { type: "string", default: "1" },
      concurrency: { type: "string", default: "4" },
      "min-pass": { type: "string", default: "0.9" },
      list: { type: "boolean", default: false },
      out: { type: "string", default: "" },
    },
  })
  const whole = (text: string, fallback: number, max: number) => {
    const value = Number.parseInt(text, 10)
    return Number.isFinite(value) && value >= 1 ? Math.min(value, max) : fallback
  }
  const minPass = Number(values["min-pass"])
  return {
    filter: values.filter.toLowerCase(),
    runs: whole(values.runs, 1, 10),
    concurrency: whole(values.concurrency, 4, 8),
    minPass: Number.isFinite(minPass) && minPass >= 0 && minPass <= 1 ? minPass : 0.9,
    list: values.list,
    // A plain name only, so a report can't be written outside evals/results/.
    out: /^[a-z0-9][a-z0-9-]{0,39}$/.test(values.out) ? values.out : "",
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

type Tokens = { input: number; output: number }

/** Asks the grader model to mark the reply against the case's rubric. One retry, then every criterion fails. */
async function grade(evalCase: EvalCase, transcript: Transcript, tokens: Tokens): Promise<{ checks: CheckResult[]; error?: string }> {
  const rubric = evalCase.rubric ?? []
  let lastError = ""

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await createClient().beta.messages.create({
        model: GRADER_MODEL,
        max_tokens: 4000,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: buildJudgeMessage(evalCase, transcript) }],
        output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
        ...fallbackOptions(GRADER_MODEL),
      })
      tokens.input += response.usage.input_tokens
      tokens.output += response.usage.output_tokens

      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        throw new Error(`the grader stopped early (${response.stop_reason})`)
      }
      const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("")
      return { checks: parseVerdicts(JSON.parse(text), rubric) }
    } catch (error) {
      lastError = describe(error)
    }
  }
  return { checks: failAll(rubric, `Not graded: ${lastError}`), error: `The grader failed: ${lastError}` }
}

/** Asks the agent one case's question, exactly as /api/chat would, and grades the answer. */
async function runCase(evalCase: EvalCase, run: number, lessonSlugs: string[]): Promise<CaseResult> {
  const transcript: Transcript = { reply: "", toolCalls: [] }
  const tokens: Tokens = { input: 0, output: 0 }
  const startedAt = Date.now()

  // The same validation the route applies, so cases can't smuggle in input a browser couldn't send.
  const request = validateChatRequest({
    messages: evalCase.messages,
    context: { transactions: evalCase.transactions ?? [], pastChats: evalCase.pastChats ?? [] },
  })

  if (!request.ok) {
    transcript.error = `The case's messages failed validation: ${request.error}`
  } else {
    try {
      const reply = streamAgentReply(request.messages, request.context, AbortSignal.timeout(CASE_TIMEOUT_MS), "standard", {
        onToolCall: (call) => transcript.toolCalls.push(call),
        onUsage: (usage) => {
          tokens.input += usage.inputTokens
          tokens.output += usage.outputTokens
        },
      })
      for await (const event of reply) {
        if (event.type === "text") transcript.reply += event.text
      }
    } catch (error) {
      transcript.error = describe(error)
    }
  }
  const answerMs = Date.now() - startedAt
  // Checks read the reply as prose. A chart or table becomes a one-line note, exactly as it does
  // in chat history, so a figure only counts as "stated" when the text says it; what went into
  // the chart itself is checked through the create_chart call.
  transcript.reply = compactArtifacts(transcript.reply)

  const checks: CheckResult[] = [answered(), onlyRealLessonLinks(lessonSlugs), ...(evalCase.checks ?? [])].map((check) => ({
    label: check.label,
    ...check.run(transcript),
    source: "code" as const,
  }))

  let error = transcript.error
  const rubric = evalCase.rubric ?? []
  if (rubric.length > 0) {
    if (transcript.error) {
      checks.push(...failAll(rubric, "Not graded: the agent didn't answer."))
    } else {
      const graded = await grade(evalCase, transcript, tokens)
      checks.push(...graded.checks)
      error = graded.error
    }
  }

  return {
    id: evalCase.id,
    category: evalCase.category,
    purpose: evalCase.purpose,
    run,
    pass: checks.every((check) => check.pass),
    checks,
    reply: transcript.reply,
    toolCalls: transcript.toolCalls,
    answerMs,
    durationMs: Date.now() - startedAt,
    tokens,
    ...(error ? { error } : {}),
  }
}

/** Runs jobs a few at a time, keeping results in the order the jobs were given. */
async function runPool<Job, Result>(jobs: Job[], limit: number, work: (job: Job) => Promise<Result>): Promise<Result[]> {
  const results = new Array<Result>(jobs.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++
      results[index] = await work(jobs[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const options = readOptions()

  const ids = CASES.map((evalCase) => evalCase.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) throw new Error(`Two cases share the id "${duplicate}".`)

  const selected = CASES.filter(
    (evalCase) => evalCase.id.includes(options.filter) || evalCase.category.includes(options.filter)
  )
  if (selected.length === 0) {
    console.error(`No case matches "${options.filter}". Run with --list to see them all.`)
    process.exitCode = 2
    return
  }

  if (options.list) {
    for (const evalCase of selected) {
      const count = 2 + (evalCase.checks?.length ?? 0) + (evalCase.rubric?.length ?? 0)
      console.log(`${evalCase.category.padEnd(11)} ${evalCase.id.padEnd(36)} ${String(count).padStart(2)} checks  ${evalCase.purpose}`)
    }
    console.log(`\n${selected.length} cases.`)
    return
  }

  if (!isAgentConfigured()) {
    console.error("No API key found. Set CLAUDE_API_KEY (or ANTHROPIC_API_KEY) in .env, then run this again.")
    process.exitCode = 2
    return
  }

  // Web search is billed per search and changes from day to day; evals test the agent without it.
  process.env.WEB_SEARCH = "off"

  const lessonSlugs = LESSONS.map((lesson) => lesson.slug)
  const startedAt = Date.now()
  console.log(`Running ${selected.length} cases${options.runs > 1 ? ` x ${options.runs} runs` : ""} against ${MODEL} (grader: ${GRADER_MODEL})\n`)

  // Cases are grouped by how market data should behave, because that is a process-wide setting.
  const results: CaseResult[] = []
  const modes: MarketMode[] = ["off", "fixture", "outage"]
  for (const mode of modes) {
    const jobs = selected
      .filter((evalCase) => (evalCase.market ?? "off") === mode)
      .flatMap((evalCase) => Array.from({ length: options.runs }, (_, index) => ({ evalCase, run: index + 1 })))
    if (jobs.length === 0) continue

    setMarketMode(mode)
    const finished = await runPool(jobs, options.concurrency, async ({ evalCase, run }) => {
      const result = await runCase(evalCase, run, lessonSlugs)
      const failed = result.checks.find((check) => !check.pass)
      const seconds = (result.durationMs / 1000).toFixed(1)
      console.log(result.pass ? `  pass  ${result.id} (${seconds}s)` : `  FAIL  ${result.id} (${seconds}s): ${failed?.label ?? result.error}`)
      return result
    })
    results.push(...finished)
  }
  setMarketMode("off")

  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id) || a.run - b.run)

  const summary = summarize(results)
  const info: RunInfo = {
    date: new Date().toISOString().slice(0, 10),
    model: MODEL,
    graderModel: GRADER_MODEL,
    runsPerCase: options.runs,
    durationSeconds: (Date.now() - startedAt) / 1000,
  }

  // A filtered run is written separately so it never replaces the full report, unless --out names a file.
  const name = options.out || (options.filter ? "partial" : "latest")
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(new URL(`${name}.md`, OUTPUT_DIR), renderMarkdown(summary, results, info))
  writeFileSync(new URL(`${name}.json`, OUTPUT_DIR), `${JSON.stringify({ info, summary, results }, null, 2)}\n`)

  console.log(`\n${summary.answers.passed} of ${summary.answers.total} passed (${percent(summary.passRate)})`)
  for (const row of summary.byCategory) {
    console.log(`  ${row.category.padEnd(11)} ${row.passed} of ${row.total}`)
  }
  if (summary.errors > 0) console.log(`  ${summary.errors} didn't complete (agent or grader error); re-run before trusting the numbers.`)
  console.log(`\nReport: evals/results/${name}.md`)

  if (summary.passRate < options.minPass) {
    console.error(`Below the ${percent(options.minPass)} pass rate required (--min-pass).`)
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error("The eval run failed:", describe(error))
  process.exitCode = 1
})
