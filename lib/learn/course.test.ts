import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { projectWithFee } from "../finance/fees.ts"
import { monthsCovered, summarizeTransactions } from "../finance/transactions.ts"
import { getLesson, lessonNeighbors, LESSONS, MODULES } from "./course.ts"
import { GLOSSARY } from "./glossary.ts"
import {
  EMPTY_PROGRESS,
  nextUnfinished,
  parseProgress,
  recordQuizScore,
  setLessonComplete,
  shuffledOrder,
} from "./progress.ts"

const TOOLS = new Set(["compound", "doubling", "fees", "budget"])
const TERMS = new Set(GLOSSARY.map((entry) => entry.term))

describe("course content", () => {
  it("has unique, URL-safe lesson slugs", () => {
    const slugs = LESSONS.map((lesson) => lesson.slug)
    assert.equal(new Set(slugs).size, slugs.length)
    for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("gives every lesson content, takeaways and a quiz with valid answers", () => {
    for (const lesson of LESSONS) {
      assert.ok(lesson.sections.length >= 2, `${lesson.slug} needs sections`)
      assert.ok(lesson.takeaways.length >= 2, `${lesson.slug} needs takeaways`)
      assert.ok(lesson.quiz.length >= 2, `${lesson.slug} needs a quiz`)
      for (const question of lesson.quiz) {
        assert.ok(question.options.length >= 2, `${lesson.slug}: too few options`)
        assert.ok(question.answer >= 0 && question.answer < question.options.length, `${lesson.slug}: bad answer index`)
        assert.equal(new Set(question.options).size, question.options.length, `${lesson.slug}: duplicate options`)
      }
    }
  })

  it("only references glossary terms and tools that exist", () => {
    for (const lesson of LESSONS) {
      for (const term of lesson.keyTerms) assert.ok(TERMS.has(term), `${lesson.slug}: unknown term ${term}`)
      for (const section of lesson.sections) {
        for (const block of section.blocks) {
          if (block.type === "tool") assert.ok(TOOLS.has(block.tool))
          if (block.type === "table") {
            for (const row of block.rows) assert.equal(row.length, block.headers.length, `${lesson.slug}: ragged table`)
          }
        }
      }
    }
  })

  it("numbers lessons in order and links neighbours", () => {
    assert.equal(LESSONS.length, MODULES.reduce((sum, module) => sum + module.lessons.length, 0))
    assert.deepEqual(LESSONS.map((lesson) => lesson.number), LESSONS.map((_, index) => index + 1))
    const first = LESSONS[0].slug
    assert.equal(lessonNeighbors(first).previous, undefined)
    assert.equal(lessonNeighbors(first).next?.slug, LESSONS[1].slug)
    assert.equal(lessonNeighbors(LESSONS[LESSONS.length - 1].slug).next, undefined)
    assert.equal(getLesson("does-not-exist"), undefined)
  })
})

describe("worked examples match the calculators", () => {
  it("fees lesson figures", () => {
    const base = { principal: 10_000, monthlyContribution: 200, annualRatePercent: 7, years: 30 }
    assert.equal(Math.round(projectWithFee({ ...base, feePercent: 0.05 }).balance / 100) * 100, 321_600)
    assert.equal(Math.round(projectWithFee({ ...base, feePercent: 0.5 }).balance / 100) * 100, 291_200)
    assert.equal(Math.round(projectWithFee({ ...base, feePercent: 1 }).balance / 100) * 100, 261_100)
    assert.equal(projectWithFee({ ...base, feePercent: 0 }).lostToFees, 0)
  })
})

describe("course progress", () => {
  const slugs = ["a", "b", "c"]

  it("drops unknown lessons and bad scores from storage", () => {
    assert.deepEqual(parseProgress({ completed: ["a", "zzz", "a", 3], quizScores: { a: 2, b: -1, zzz: 3, c: 1.5 } }, slugs), {
      completed: ["a"],
      quizScores: { a: 2 },
    })
    assert.deepEqual(parseProgress("nope", slugs), EMPTY_PROGRESS)
  })

  it("marks lessons done and keeps the best quiz score", () => {
    let progress = setLessonComplete(EMPTY_PROGRESS, "a", true)
    progress = setLessonComplete(progress, "a", true)
    assert.deepEqual(progress.completed, ["a"])
    progress = recordQuizScore(progress, "a", 3)
    progress = recordQuizScore(progress, "a", 1)
    assert.equal(progress.quizScores.a, 3)
    assert.equal(nextUnfinished(progress, slugs), "b")
    assert.equal(nextUnfinished(setLessonComplete(progress, "a", false), slugs), "a")
    assert.equal(nextUnfinished({ completed: slugs, quizScores: {} }, slugs), null)
  })

  it("shuffles quiz options stably", () => {
    const order = shuffledOrder("fees-0", 4)
    assert.deepEqual([...order].sort(), [0, 1, 2, 3])
    assert.deepEqual(shuffledOrder("fees-0", 4), order)
    // Across the course, correct answers shouldn't all land in one position.
    const positions = new Set(
      LESSONS.flatMap((lesson) =>
        lesson.quiz.map((question, index) =>
          shuffledOrder(`${lesson.slug}-${index}`, question.options.length).indexOf(question.answer)
        )
      )
    )
    assert.ok(positions.size >= 3)
  })
})

describe("emergency fund figures", () => {
  it("uses average monthly spending", () => {
    const summary = summarizeTransactions([
      { date: "2026-01-05", description: "Pay", amount: 3000 },
      { date: "2026-01-06", description: "Rent", amount: -1000 },
      { date: "2026-02-06", description: "Rent", amount: -1000 },
    ])!
    assert.deepEqual(summary.emergencyFund, { threeMonths: 3000, sixMonths: 6000 })
    assert.equal(monthsCovered(2500, 1000), 2.5)
    assert.equal(monthsCovered(100, 0), 0)
  })
})
