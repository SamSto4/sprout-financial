// Compares two saved runs of the screenshot eval, without calling the API:
//
//   npm run eval:screenshots:compare -- bench-haiku my-change
//
// reads evals/results/screenshots-bench-haiku.json and evals/results/screenshots-my-change.json,
// prints the comparison and writes it to evals/results/screenshots-compare-my-change.md. It refuses
// (exit code 1) when the runs don't have the same cases, answer keys and number of runs.

import { readFileSync, writeFileSync } from "node:fs"

import { compareRuns, type SavedRun } from "./compare.ts"

const RESULTS = new URL("../results/", import.meta.url)
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

const [base, candidate] = process.argv.slice(2)
if (!base || !candidate || !NAME.test(base) || !NAME.test(candidate)) {
  console.error("Usage: npm run eval:screenshots:compare -- <base name> <candidate name>   (the --out names of two runs)")
  process.exit(2)
}

const load = (name: string) => JSON.parse(readFileSync(new URL(`screenshots-${name}.json`, RESULTS), "utf8")) as SavedRun
const comparison = compareRuns(load(base), load(candidate), { base, candidate })
console.log(comparison.markdown)
if (comparison.problems.length > 0) process.exitCode = 1
else writeFileSync(new URL(`screenshots-compare-${candidate}.md`, RESULTS), `${comparison.markdown}\n`)
