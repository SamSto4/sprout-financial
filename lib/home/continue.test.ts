import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { EMPTY_PROFILE } from "../plan/profile.ts"
import { buildRoadmap } from "../plan/roadmap.ts"
import { continueCards, type ContinueState } from "./continue.ts"

const LESSONS = [
  { slug: "first", title: "First steps", number: 1 },
  { slug: "second", title: "Second steps", number: 2 },
  { slug: "third", title: "Third steps", number: 3 },
]
const EMPTY: ContinueState = { progress: { completed: [] }, profile: null, chats: [], finances: null }

function card(state: Partial<ContinueState>, id: string) {
  const found = continueCards({ ...EMPTY, ...state }, LESSONS).find((candidate) => candidate.id === id)
  assert.ok(found, `no ${id} card`)
  return found
}

describe("continueCards", () => {
  it("shows starting points when nothing is saved yet", () => {
    const cards = continueCards(EMPTY, LESSONS)
    assert.deepEqual(
      cards.map((c) => c.id),
      ["course", "plan", "assistant", "dashboard"]
    )
    assert.deepEqual(
      cards.map((c) => [c.title, c.href]),
      [
        ["Start the course", "/learn/first"],
        ["Make your plan", "/plan"],
        ["Ask your first question", "/assistant"],
        ["See where your money goes", "/dashboard#your-finances"],
      ]
    )
    assert.equal(cards[0].detail, "3 short lessons. First up: First steps")
  })

  it("continues with the first unfinished lesson and counts only real lessons", () => {
    const course = card({ progress: { completed: ["second", "retired-lesson"] } }, "course")
    assert.equal(course.title, "Lesson 1: First steps")
    assert.equal(course.detail, "1 of 3 lessons done")
    assert.equal(course.href, "/learn/first")
    assert.equal(course.cta, "Continue")
  })

  it("treats progress only on retired lessons as not started", () => {
    assert.equal(card({ progress: { completed: ["retired-lesson"] } }, "course").title, "Start the course")
  })

  it("says when the course is finished", () => {
    const course = card({ progress: { completed: ["first", "second", "third"] } }, "course")
    assert.equal(course.title, "Course complete")
    assert.equal(course.href, "/learn")
  })

  it("points to the course page when there are no lessons", () => {
    const course = continueCards(EMPTY, [])[0]
    assert.equal(course.href, "/learn")
  })

  it("names the plan's current roadmap step", () => {
    const profile = { ...EMPTY_PROFILE, updatedAt: "2026-10-01T00:00:00.000Z" }
    const roadmap = buildRoadmap(profile)
    assert.ok(roadmap.current)
    const plan = card({ profile }, "plan")
    assert.equal(plan.title, roadmap.current.title)
    assert.equal(plan.detail, `Step ${roadmap.steps.indexOf(roadmap.current) + 1} of ${roadmap.steps.length} on your roadmap`)
    assert.equal(plan.cta, "Open my plan")
  })

  it("treats a plan that was never saved as no plan", () => {
    assert.equal(card({ profile: EMPTY_PROFILE }, "plan").title, "Make your plan")
  })

  it("mentions the most recent chat, whatever order chats are stored in, and links straight to it", () => {
    const chats = [
      { id: "older-1", title: "Older chat", updatedAt: "2026-09-01T10:00:00.000Z" },
      { id: "newest-2", title: "Newest chat", updatedAt: "2026-10-20T10:00:00.000Z" },
      { id: "middle-3", title: "Middle chat", updatedAt: "2026-10-01T10:00:00.000Z" },
    ]
    const assistant = card({ chats }, "assistant")
    assert.equal(assistant.detail, "3 saved chats. Latest: Newest chat")
    assert.equal(assistant.href, "/assistant?chat=newest-2")
    assert.equal(assistant.cta, "Open the latest chat")
    assert.equal(card({ chats: chats.slice(0, 1) }, "assistant").detail, "1 saved chat. Latest: Older chat")
    assert.equal(card({ chats: chats.slice(0, 1) }, "assistant").href, "/assistant?chat=older-1")
  })

  it("opens a new chat when there are none", () => {
    const assistant = card({ chats: [] }, "assistant")
    assert.equal(assistant.href, "/assistant")
    assert.equal(assistant.cta, "Open the assistant")
  })

  it("counts imported transactions", () => {
    assert.equal(card({ finances: { transactions: new Array(1234).fill(null) } }, "dashboard").detail, "1,234 imported transactions")
    assert.equal(card({ finances: { transactions: [null] } }, "dashboard").detail, "1 imported transaction")
    assert.equal(card({ finances: { transactions: [] } }, "dashboard").title, "See where your money goes")
  })

  it("jumps past the budget planner to the import when nothing is imported yet", () => {
    assert.equal(card({ finances: null }, "dashboard").href, "/dashboard#your-finances")
    assert.equal(card({ finances: { transactions: [] } }, "dashboard").href, "/dashboard#your-finances")
    assert.equal(card({ finances: { transactions: [null] } }, "dashboard").href, "/dashboard")
  })
})
