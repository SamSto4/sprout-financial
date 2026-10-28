import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { addFocus, FOCUS, FOCUS_IDS, focusLabels, MAX_FOCUS, parseFocus, starterQuestions, stepStarter } from "./focus.ts"

describe("FOCUS", () => {
  it("has the seven chips of the empty chat, each with its own starter question", () => {
    assert.deepEqual(
      FOCUS_IDS.map((id) => FOCUS[id].chip),
      ["Getting out of debt", "Building savings", "Starting to invest", "Retirement", "Buying a home", "Making a budget", "Just learning"]
    )
    const starters = FOCUS_IDS.map((id) => FOCUS[id].starter)
    assert.equal(new Set(starters).size, starters.length)
    for (const starter of starters) assert.ok(starter.length < 100 && /[?]$/.test(starter), starter)
  })
  it("writes no amounts into the questions (screens get shared)", () => {
    for (const id of FOCUS_IDS) for (const question of [FOCUS[id].starter, ...FOCUS[id].more]) assert.doesNotMatch(question, /[$£€]\d/)
  })
})

describe("parseFocus", () => {
  it("keeps known topics once each, up to the limit", () => {
    assert.deepEqual(parseFocus(["debt", "debt", "lambo", "saving", 3, "home", "budget"]), ["debt", "saving", "home"])
    assert.equal(parseFocus(FOCUS_IDS).length, MAX_FOCUS)
  })
  it("refuses inherited names and non-arrays", () => {
    assert.deepEqual(parseFocus(["constructor", "toString", "__proto__"]), [])
    assert.deepEqual(parseFocus("debt"), [])
    assert.deepEqual(parseFocus(null), [])
  })
})

describe("addFocus", () => {
  it("puts the newest first and drops the oldest past the limit", () => {
    assert.deepEqual(addFocus([], "debt"), ["debt"])
    assert.deepEqual(addFocus(["debt", "saving"], "debt"), ["debt", "saving"])
    assert.deepEqual(addFocus(["saving", "debt"], "debt"), ["debt", "saving"])
    assert.deepEqual(addFocus(["home", "saving", "debt"], "budget"), ["budget", "home", "saving"])
  })
})

describe("focusLabels", () => {
  it("joins labels in plain English", () => {
    assert.equal(focusLabels([]), "")
    assert.equal(focusLabels(["debt"]), "paying off debt")
    assert.equal(focusLabels(["debt", "saving"]), "paying off debt and building savings")
    assert.equal(focusLabels(["debt", "saving", "home"]), "paying off debt, building savings and buying a home")
  })
})

describe("starterQuestions", () => {
  it("is empty with no focus and no step, so the page keeps its usual suggestions", () => {
    assert.deepEqual(starterQuestions({ focus: [] }), [])
  })
  it("puts the roadmap step's question first, then each focus", () => {
    const questions = starterQuestions({ focus: ["debt", "saving"], step: "high-interest-debt" })
    assert.equal(questions[0], stepStarter("high-interest-debt"))
    assert.equal(questions[1], FOCUS.debt.more[0])
    assert.equal(questions[2], FOCUS.saving.more[0])
    assert.equal(questions.length, 4)
  })
  it("respects the limit and never repeats a question", () => {
    const questions = starterQuestions({ focus: ["debt", "saving", "home"] }, 10)
    assert.equal(new Set(questions).size, questions.length)
    assert.equal(starterQuestions({ focus: ["debt"] }, 1).length, 1)
  })
})
