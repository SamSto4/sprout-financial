import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { EMPTY_PROGRESS, setLessonComplete, type CourseProgress } from "../learn/progress.ts"
import {
  mergeAccountProgress,
  parseProgressRemovals,
  recordNotDone,
  recordReset,
  sameProgress,
} from "./progress-removals.ts"

const ACCOUNT: CourseProgress = { completed: ["a", "b", "c"], quizScores: { a: 3, b: 4 } }
// The account's copy as read at time 100.
const account = (progress = ACCOUNT, knownAt = 100) => ({ progress, knownAt })

describe("mergeAccountProgress", () => {
  it("keeps the account's progress when this browser's storage was emptied", () => {
    assert.ok(sameProgress(mergeAccountProgress(EMPTY_PROGRESS, account(), null), ACCOUNT))
  })

  it("adds a lesson finished after storage was emptied instead of replacing the account's", () => {
    const merged = mergeAccountProgress({ completed: ["d"], quizScores: { d: 5 } }, account(), null)
    assert.deepEqual(merged, { completed: ["a", "b", "c", "d"], quizScores: { a: 3, b: 4, d: 5 } })
  })

  it("uploads the empty progress after Reset progress", () => {
    assert.deepEqual(mergeAccountProgress(EMPTY_PROGRESS, account(), recordReset(150)), EMPTY_PROGRESS)
  })

  it("keeps lessons finished after a reset", () => {
    const local = setLessonComplete(EMPTY_PROGRESS, "a", true)
    assert.deepEqual(mergeAccountProgress(local, account(), recordReset(150)), local)
  })

  it("leaves out a lesson marked as not done, keeping its quiz score", () => {
    const local = setLessonComplete(ACCOUNT, "a", false)
    const merged = mergeAccountProgress(local, account(), recordNotDone(null, "a", 150))
    assert.ok(sameProgress(merged, { completed: ["b", "c"], quizScores: { a: 3, b: 4 } }))
  })

  it("still leaves out the un-done lesson if storage is emptied before the upload", () => {
    const merged = mergeAccountProgress(EMPTY_PROGRESS, account(), recordNotDone(null, "a", 150))
    assert.ok(sameProgress(merged, { completed: ["b", "c"], quizScores: { a: 3, b: 4 } }))
  })

  it("counts a lesson finished again after being marked not done", () => {
    const merged = mergeAccountProgress(ACCOUNT, account(), recordNotDone(null, "a", 150))
    assert.ok(sameProgress(merged, ACCOUNT))
  })

  it("ignores removals made before the account's copy was read", () => {
    // Already in that copy, or undone since (another device finished the lesson again).
    const removals = recordNotDone(recordReset(50), "a", 60)
    assert.ok(sameProgress(mergeAccountProgress(EMPTY_PROGRESS, account(), removals), ACCOUNT))
  })

  it("applies a reset made in another tab to this tab's older copy", () => {
    // The other tab already uploaded the reset; this tab still has the copy from page load.
    assert.deepEqual(mergeAccountProgress(EMPTY_PROGRESS, account(ACCOUNT, 10), recordReset(100)), EMPTY_PROGRESS)
  })

  it("uses this browser's progress when the account has none", () => {
    const local = setLessonComplete(EMPTY_PROGRESS, "a", true)
    assert.equal(mergeAccountProgress(local, null, recordReset(150)), local)
  })
})

describe("progress removals", () => {
  it("a reset replaces earlier un-completions, which it covers", () => {
    assert.deepEqual(recordReset(200), { resetAt: 200, notDone: {} })
    assert.deepEqual(recordNotDone(recordReset(200), "a", 300), { resetAt: 200, notDone: { a: 300 } })
  })

  it("parses stored removals and drops anything malformed", () => {
    assert.equal(parseProgressRemovals(null), null)
    assert.equal(parseProgressRemovals("nope"), null)
    assert.deepEqual(parseProgressRemovals({ resetAt: -1, notDone: { a: 5, "Bad Slug": 6, b: "7", c: Infinity } }), {
      resetAt: 0,
      notDone: { a: 5 },
    })
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`lesson-${index}`, index]))
    assert.equal(Object.keys(parseProgressRemovals({ resetAt: 1, notDone: many })?.notDone ?? {}).length, 200)
  })
})

describe("sameProgress", () => {
  it("ignores order", () => {
    assert.ok(sameProgress({ completed: ["a", "b"], quizScores: { a: 1, b: 2 } }, { completed: ["b", "a"], quizScores: { b: 2, a: 1 } }))
    assert.ok(!sameProgress({ completed: ["a"], quizScores: {} }, { completed: ["a"], quizScores: { a: 0 } }))
  })
})
