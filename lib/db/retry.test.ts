import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { onceWithRetry } from "./retry.ts"

function setup(results: ("ok" | "fail")[]) {
  let time = 0
  let runs = 0
  const errors: unknown[] = []
  const run = onceWithRetry(
    async (label: string) => {
      runs++
      if ((results[runs - 1] ?? "ok") === "fail") throw new Error(`index conflict (${label})`)
    },
    { coolDownMs: 300_000, onError: (error) => errors.push(error), now: () => time }
  )
  return { run, runs: () => runs, errors, advance: (ms: number) => (time += ms) }
}

describe("onceWithRetry (index setup)", () => {
  it("runs once and shares the result, however many calls come in", async () => {
    const { run, runs, errors } = setup(["ok"])
    await Promise.all([run("a"), run("b"), run("c")])
    await run("d")
    assert.equal(runs(), 1)
    assert.deepEqual(errors, [])
  })

  it("after a failure, lets calls through without rerunning until the cool-down has passed", async () => {
    const { run, runs, errors, advance } = setup(["fail", "fail", "ok"])
    await run("first")
    assert.equal(errors.length, 1, "the failure is reported once")
    for (let call = 0; call < 50; call++) await run("busy")
    assert.equal(runs(), 1, "no rerun on every database call")

    advance(299_999)
    await run("almost")
    assert.equal(runs(), 1)
    advance(1)
    await run("retry")
    assert.equal(runs(), 2)
    assert.equal(errors.length, 2)

    advance(300_000)
    await run("fixed")
    advance(10_000_000)
    await run("later")
    assert.equal(runs(), 3, "once it works, it never runs again")
    assert.equal(errors.length, 2)
  })

  it("never rejects, so a failed setup doesn't fail the request that triggered it", async () => {
    const { run } = setup(["fail"])
    await assert.doesNotReject(run("x"))
  })
})
