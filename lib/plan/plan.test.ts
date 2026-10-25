import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMPTY_PROFILE,
  highInterestDebts,
  horizonBand,
  missingDetails,
  parseProfile,
  riskLevel,
  riskScore,
  targetStockRange,
  type InvestorProfile,
} from "./profile.ts"
import { buildRoadmap } from "./roadmap.ts"

const base: InvestorProfile = {
  ...EMPTY_PROFILE,
  updatedAt: "2026-10-25T00:00:00.000Z",
  country: "United States",
  goal: "retirement",
  horizonYears: 40,
  riskAnswers: [2, 2, 2, 2, 2],
  monthlyIncome: 3000,
  monthlyEssentials: 1500,
  emergencySavings: 5000,
  debts: [],
  employerMatch: "capturing",
  hasTaxAdvantagedAccount: "yes",
}

describe("risk quiz", () => {
  it("needs every question answered", () => {
    assert.equal(riskScore([1, 2]), null)
    assert.equal(riskLevel([]), null)
  })
  it("maps the score to a level at the band edges", () => {
    assert.equal(riskLevel([0, 0, 0, 1, 3]), "conservative") // 4
    assert.equal(riskLevel([1, 1, 1, 1, 1]), "moderate") // 5
    assert.equal(riskLevel([2, 2, 2, 1, 1]), "moderate") // 8
    assert.equal(riskLevel([2, 2, 2, 2, 1]), "growth") // 9
    assert.equal(riskLevel([3, 3, 3, 3, 0]), "growth") // 12
    assert.equal(riskLevel([3, 3, 3, 3, 1]), "aggressive") // 13
  })
})

describe("targetStockRange", () => {
  it("is null until horizon and quiz are both known", () => {
    assert.equal(targetStockRange({ horizonYears: null, riskAnswers: [2, 2, 2, 2, 2] }), null)
    assert.equal(targetStockRange({ horizonYears: 30, riskAnswers: [] }), null)
  })
  it("keeps money needed soon mostly out of stocks, whatever the risk appetite", () => {
    assert.deepEqual(targetStockRange({ horizonYears: 2, riskAnswers: [3, 3, 3, 3, 3] }), { min: 10, max: 30 })
  })
  it("allows more stocks for longer horizons", () => {
    assert.deepEqual(targetStockRange({ horizonYears: 40, riskAnswers: [2, 2, 2, 2, 2] }), { min: 75, max: 95 })
    assert.deepEqual(targetStockRange({ horizonYears: 8, riskAnswers: [1, 1, 1, 1, 1] }), { min: 50, max: 70 })
  })
  it("bands horizons at 3, 6 and 11 years", () => {
    assert.equal(horizonBand(2), "short")
    assert.equal(horizonBand(3), "medium")
    assert.equal(horizonBand(6), "long")
    assert.equal(horizonBand(11), "veryLong")
  })
})

describe("parseProfile", () => {
  it("drops bad values and clamps numbers", () => {
    const parsed = parseProfile({
      ...base,
      goal: "lambo",
      riskAnswers: [1, 2, 9, 1, 1],
      monthlyIncome: -50,
      age: 400,
      debts: [{ id: "x", name: "Card", balance: 1000, aprPercent: 250 }, { name: "bad" }, "nope"],
      country: { $ne: 1 },
    })
    assert.ok(parsed)
    assert.equal(parsed.goal, "not_sure")
    assert.deepEqual(parsed.riskAnswers, [])
    assert.equal(parsed.monthlyIncome, 0)
    assert.equal(parsed.age, 110)
    assert.equal(parsed.country, "")
    assert.equal(parsed.debts.length, 1)
    assert.equal(parsed.debts[0].aprPercent, 100)
  })
  it("returns null for non-objects", () => {
    assert.equal(parseProfile("hi"), null)
  })
  it("rejects inherited object names as choices", () => {
    // `"constructor" in GOALS` is true, so the old check let these through as a goal.
    const parsed = parseProfile({ goal: "constructor", experience: "toString", employerMatch: "__proto__", hasTaxAdvantagedAccount: "hasOwnProperty" })
    assert.equal(parsed?.goal, "not_sure")
    assert.equal(parsed?.experience, "new")
    assert.equal(parsed?.employerMatch, "unsure")
    assert.equal(parsed?.hasTaxAdvantagedAccount, "unsure")
  })
})

describe("missingDetails", () => {
  it("lists what's blank", () => {
    assert.deepEqual(missingDetails(base), [])
    assert.ok(missingDetails(EMPTY_PROFILE).includes("time horizon"))
  })
})

describe("buildRoadmap", () => {
  it("marks everything done for someone set up, with taxable investing as the last step", () => {
    const roadmap = buildRoadmap(base)
    assert.equal(roadmap.current?.id, "invest-more")
    assert.equal(roadmap.done, 5)
  })

  it("starts at the starter buffer when savings are below one month of essentials", () => {
    const roadmap = buildRoadmap({ ...base, emergencySavings: 400 })
    assert.equal(roadmap.current?.id, "starter-buffer")
    assert.equal(roadmap.current?.status, "current")
    assert.equal(roadmap.current?.gap, 1100)
    assert.match(roadmap.nextAction, /\$1,100/)
  })

  it("puts high-interest debt next, highest rate first", () => {
    const roadmap = buildRoadmap({
      ...base,
      debts: [
        { id: "a", name: "Car loan", balance: 8000, aprPercent: 6, minPayment: 200 },
        { id: "b", name: "Store card", balance: 900, aprPercent: 29, minPayment: 35 },
        { id: "c", name: "Visa", balance: 2100, aprPercent: 22, minPayment: 60 },
      ],
    })
    assert.equal(roadmap.current?.id, "high-interest-debt")
    assert.equal(roadmap.current?.gap, 3000)
    assert.match(roadmap.current?.detail ?? "", /Store card \(29%\)/)
    assert.deepEqual(highInterestDebts(base).length, 0)
  })

  it("asks for information instead of guessing", () => {
    const roadmap = buildRoadmap({ ...base, emergencySavings: null })
    assert.equal(roadmap.steps[0].status, "needs-info")
    assert.equal(roadmap.current?.id, "starter-buffer")
    assert.match(roadmap.nextAction, /emergency savings/)
  })

  it("flags an unclaimed employer match", () => {
    const roadmap = buildRoadmap({ ...base, employerMatch: "missing" })
    assert.equal(roadmap.current?.id, "employer-match")
  })

  it("sizes the full emergency fund at three months", () => {
    const roadmap = buildRoadmap({ ...base, emergencySavings: 2000 })
    const full = roadmap.steps.find((step) => step.id === "full-emergency-fund")
    assert.equal(full?.gap, 2500)
    assert.equal(roadmap.current?.id, "full-emergency-fund")
  })

  it("doesn't assume US accounts outside the US", () => {
    const roadmap = buildRoadmap({ ...base, country: "Israel", hasTaxAdvantagedAccount: "no" })
    const step = roadmap.steps.find((s) => s.id === "tax-advantaged")
    assert.doesNotMatch(step?.detail ?? "", /Roth/)
    assert.doesNotMatch(roadmap.nextAction, /Roth|401/)
  })
})
