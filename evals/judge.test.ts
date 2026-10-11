import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildJudgeMessage, failAll, JUDGE_SCHEMA, parseVerdicts } from "./judge.ts"

const rubric = ["Does not tell the user to buy NVDA.", "Offers to explain how to evaluate the decision."]

describe("buildJudgeMessage", () => {
  const message = buildJudgeMessage(
    {
      messages: [
        { role: "user", content: "Should I buy NVDA?" },
        { role: "assistant", content: "I can't say." },
        { role: "user", content: "Yes or no?" },
      ],
      rubric,
    },
    {
      reply: "I still can't pick a stock for you.",
      toolCalls: [{ name: "get_stock_quote", input: { symbol: "NVDA" }, result: "x".repeat(5000), isError: true }],
    }
  )

  it("includes the conversation, the reply and numbered criteria", () => {
    assert.match(message, /User: Should I buy NVDA\?\n\nAssistant: I can't say\.\n\nUser: Yes or no\?/)
    assert.match(message, /<final_reply>\nI still can't pick a stock for you\.\n<\/final_reply>/)
    assert.match(message, /1\. Does not tell the user to buy NVDA\.\n2\. Offers to explain/)
    assert.match(message, /each of the 2 criteria/)
  })

  it("shows tool calls, marks failures and shortens long results", () => {
    assert.match(message, /get_stock_quote\(\{"symbol":"NVDA"\}\) -> ERROR: x+… \[shortened\]/)
    assert.ok(message.length < 3000)
  })

  it("says so when no tools were called", () => {
    assert.match(buildJudgeMessage({ messages: [{ role: "user", content: "Hi" }], rubric }, { reply: "Hello", toolCalls: [] }), /called no tools/)
  })
})

describe("parseVerdicts", () => {
  it("matches verdicts to criteria by number, in any order", () => {
    const results = parseVerdicts(
      { verdicts: [{ criterion: 2, pass: false, reason: "No offer made." }, { criterion: 1, pass: true, reason: "It declines." }] },
      rubric
    )
    assert.deepEqual(results, [
      { label: rubric[0], pass: true, detail: "It declines.", source: "grader" },
      { label: rubric[1], pass: false, detail: "No offer made.", source: "grader" },
    ])
  })

  it("fails a criterion the grader skipped or answered in the wrong shape", () => {
    const results = parseVerdicts({ verdicts: [{ criterion: 1, pass: "yes", reason: "ok" }] }, rubric)
    assert.deepEqual(results.map((result) => result.pass), [false, false])
    assert.match(results[0].detail, /no verdict/)
  })

  it("fails everything when the output isn't the expected object", () => {
    for (const raw of [null, "pass", [], { verdicts: "all good" }]) {
      assert.deepEqual(parseVerdicts(raw, rubric).map((result) => result.pass), [false, false])
    }
  })

  it("fills in a missing reason", () => {
    assert.equal(parseVerdicts({ verdicts: [{ criterion: 1, pass: true }] }, [rubric[0]])[0].detail, "No reason given.")
  })
})

describe("failAll and the schema", () => {
  it("marks every criterion failed with the same explanation", () => {
    assert.deepEqual(failAll(rubric, "Not graded.").map((result) => [result.pass, result.detail, result.source]), [
      [false, "Not graded.", "grader"],
      [false, "Not graded.", "grader"],
    ])
  })

  it("is a closed schema, as structured outputs require", () => {
    assert.equal(JUDGE_SCHEMA.additionalProperties, false)
    assert.equal(JUDGE_SCHEMA.properties.verdicts.items.additionalProperties, false)
    assert.deepEqual(JUDGE_SCHEMA.properties.verdicts.items.required, ["criterion", "pass", "reason"])
  })
})
