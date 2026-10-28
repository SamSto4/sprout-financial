// Runs the screenshot import eval: reads every image in evals/screenshots/images/ with the real
// model call (lib/ai/screenshot-reader.ts), puts the answer through the same rules the browser
// uses (lib/screenshots), and scores it against the answer key in cases.ts. A tall capture that
// the browser cuts into pieces is saved as <name>.1.jpg, <name>.2.jpg and so on (render.mts runs
// the browser's own code to make them), and its pieces are checked and sent together, as the
// route does.
//
//   npm run eval:screenshots                         every case, 3 runs each
//   npm run eval:screenshots -- --runs 1             one run each
//   npm run eval:screenshots -- --effort medium      try another effort level
//   npm run eval:screenshots -- --out sonnet         write evals/results/screenshots-sonnet.md, to
//                                                    compare models (set SCREENSHOT_MODEL for the run)
//   npm run eval:screenshots -- --filter capture     only cases whose id contains "capture"
//
// To compare a change with a saved run (same cases, images and runs), without calling the API:
//
//   npm run eval:screenshots:compare -- bench-haiku my-change
//
// The report counts errors by type (date, amount, direction, description, ticker, value, asset
// type, missed, made up, pending or cut-off rows kept) and per case, and how often the holdings
// review would warn that the rows don't add up to the screen's total (totalsThatDontAddUp), on
// right reads and wrong ones. The JSON beside it also holds what each read produced, for working
// out why a row went wrong.
//
// It calls the Anthropic API once per read, so it needs CLAUDE_API_KEY and uses a little credit.
// There's no grader model: every check is exact.

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { isAgentConfigured, SCREENSHOT_MODEL } from "@/lib/ai/client"
import { readScreenshot } from "@/lib/ai/screenshot-reader"

import { holdingsFromScreenshots } from "../../lib/screenshots/holding-rows.ts"
import { parseScreenshotUploads } from "../../lib/screenshots/image.ts"
import { buildTransactionReview } from "../../lib/screenshots/transaction-rows.ts"
import { SCREENSHOT_CASES, type ScreenshotCase } from "./cases.ts"
import { TODAY } from "./fixtures.ts"
import type { RunInfo } from "./compare.ts"
import { describeProduced, emptyRows, expectedRows, renderMarkdown, scoreCase, summarize, warnsTotal, type CaseResult, type Produced } from "./score.ts"

const IMAGES = new URL("./images/", import.meta.url)
const OUTPUT = new URL("../results/", import.meta.url)
const EFFORTS = ["low", "medium", "high"] as const

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    effort: { type: "string", default: "low" },
    filter: { type: "string", default: "" },
    out: { type: "string", default: "" },
  },
})
const runs = Math.min(10, Math.max(1, Number.parseInt(values.runs, 10) || 3))
const effort = (EFFORTS as readonly string[]).includes(values.effort) ? (values.effort as (typeof EFFORTS)[number]) : "low"
// A plain name only, so a report can't be written outside evals/results/.
const out = /^[a-z0-9][a-z0-9-]{0,39}$/.test(values.out) ? values.out : ""

/** The image a case reads: <name>.jpg, or the pieces <name>.1.jpg, <name>.2.jpg, ... in order. */
function imageFiles(image: string): Buffer[] {
  if (existsSync(new URL(image, IMAGES))) return [readFileSync(new URL(image, IMAGES))]
  const piece = (n: number) => new URL(image.replace(/\.jpg$/, `.${n}.jpg`), IMAGES)
  const pieces: Buffer[] = []
  for (let n = 1; existsSync(piece(n)); n++) pieces.push(readFileSync(piece(n)))
  if (pieces.length === 0) throw new Error(`No image ${image} in evals/screenshots/images/. Run render.mts.`)
  return pieces
}

async function runCase(screenshotCase: ScreenshotCase, run: number): Promise<CaseResult> {
  const started = Date.now()
  let costUsd = 0
  const base = { id: screenshotCase.id, kind: screenshotCase.kind, purpose: screenshotCase.purpose, run }
  try {
    // Checked as the route checks a request: each piece, how many, and their total size.
    const upload = parseScreenshotUploads(imageFiles(screenshotCase.image).map((file) => ({ mediaType: "image/jpeg", data: file.toString("base64") })))
    if (!upload.ok) throw new Error(`The route would refuse ${screenshotCase.image}: ${upload.error}`)
    const image = upload.images
    const onCost = (usd: number) => {
      costUsd += usd
    }
    let produced: Produced
    if (screenshotCase.kind === "transactions") {
      const screenshot = await readScreenshot("transactions", image, { effort, onCost })
      produced = { kind: "transactions", problem: screenshot.problem, review: buildTransactionReview([screenshot], [], TODAY) }
    } else {
      const screenshot = await readScreenshot("holdings", image, { effort, onCost })
      produced = { kind: "holdings", problem: screenshot.problem, holdings: holdingsFromScreenshots([screenshot]), rows: screenshot.rows }
    }
    const ms = Date.now() - started
    const { checks, rows } = scoreCase(screenshotCase, produced)
    const warning = produced.kind === "holdings" ? { totalWarning: warnsTotal(produced) } : {}
    return { ...base, pass: checks.every((check) => check.pass), checks, rows, ms, costUsd, ...warning, got: describeProduced(produced) }
  } catch (error) {
    // Nothing came back, so every row on the screen counts as missed.
    const rows = emptyRows(expectedRows(screenshotCase))
    rows.missed = rows.expected
    return {
      ...base,
      pass: false,
      checks: [],
      rows,
      ms: Date.now() - started,
      costUsd,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  if (!isAgentConfigured()) {
    console.error("No API key found. Set CLAUDE_API_KEY (or ANTHROPIC_API_KEY) in .env, then run this again.")
    process.exitCode = 2
    return
  }
  const cases = SCREENSHOT_CASES.filter((c) => c.id.includes(values.filter))
  console.log(`Reading ${cases.length} screenshots x ${runs} runs with ${SCREENSHOT_MODEL} at effort ${effort}\n`)

  // Two at a time: enough to finish quickly without tripping API rate limits.
  const jobs = cases.flatMap((screenshotCase) => Array.from({ length: runs }, (_, index) => ({ screenshotCase, run: index + 1 })))
  const results: CaseResult[] = new Array(jobs.length)
  let next = 0
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < jobs.length) {
        const index = next++
        const { screenshotCase, run } = jobs[index]
        const result = await runCase(screenshotCase, run)
        results[index] = result
        const failed = result.checks.find((check) => !check.pass)
        console.log(`  ${result.pass ? "pass" : "FAIL"}  ${result.id} #${run} (${(result.ms / 1000).toFixed(1)}s)${result.pass ? "" : `: ${result.error ?? failed?.label}`}`)
      }
    })
  )

  const summary = summarize(results)
  const date = new Date().toISOString().slice(0, 10)
  const report = renderMarkdown(summary, results, { date, model: SCREENSHOT_MODEL, effort, runs })
  // What this run read and scored against, so compare.mts can tell whether two runs are comparable.
  const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex").slice(0, 16)
  const info: RunInfo = {
    date,
    model: SCREENSHOT_MODEL,
    effort,
    runs,
    cases: Object.fromEntries(
      cases.map((c) => [c.id, { image: c.image, imageSha256: sha256(Buffer.concat(imageFiles(c.image))), expectSha256: sha256(JSON.stringify(c.expect)) }])
    ),
  }
  const name = `screenshots${out ? `-${out}` : values.filter ? "-partial" : ""}`
  mkdirSync(OUTPUT, { recursive: true })
  writeFileSync(new URL(`${name}.md`, OUTPUT), `${report}\n`)
  writeFileSync(new URL(`${name}.json`, OUTPUT), `${JSON.stringify({ info, summary, results }, null, 2)}\n`)

  console.log(`\n${summary.passed} of ${summary.total} passed. Rows exact: ${summary.rows.exact} of ${summary.rows.expected}, wrong: ${summary.rows.wrong}, missed: ${summary.rows.missed}, made up: ${summary.rows.invented}, kept: ${summary.rows.keptLeftOut}.`)
  if (summary.seconds) console.log(`Time per screenshot ${summary.seconds.median}s median, ${summary.seconds.p95}s p95. Cost $${summary.costPerScreenshot.toFixed(4)} each.`)
  console.log(`Report: evals/results/${name}.md`)
  if (summary.passed < summary.total) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error("The screenshot eval failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
