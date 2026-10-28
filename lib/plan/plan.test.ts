import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMPTY_PROFILE,
  experienceChosen,
  hasPlanDetails,
  highInterestDebts,
  horizonBand,
  missingDetails,
  parseProfile,
  profileCountryCode,
  profileCurrency,
  riskLevel,
  riskScore,
  stampProfile,
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

// A profile exactly as the My plan page stored it before focus, country codes, currency and
// field stamps existed. It must parse to the same object it always did.
const STORED_BEFORE = {
  updatedAt: "2026-10-20T18:42:11.512Z",
  age: 29,
  country: "Canada",
  goal: "house",
  horizonYears: 4,
  experience: "some",
  riskAnswers: [1, 2, 1, 2, 2],
  monthlyIncome: 4100,
  monthlyEssentials: 2300,
  emergencySavings: 3500,
  debts: [{ id: "debt-1", name: "Visa", balance: 1800, aprPercent: 21.99, minPayment: 45 }],
  employerMatch: "capturing",
  hasTaxAdvantagedAccount: "yes",
}

describe("parseProfile with the newer fields", () => {
  it("parses a profile stored before them exactly as before", () => {
    const parsed = parseProfile(JSON.parse(JSON.stringify(STORED_BEFORE)))
    assert.deepEqual(parsed, STORED_BEFORE)
    assert.equal(JSON.stringify(parsed), JSON.stringify(STORED_BEFORE))
  })

  it("reads focus, country code, currency and stamps, best-effort", () => {
    const parsed = parseProfile({
      ...STORED_BEFORE,
      focus: ["debt", "lambo", "home", "debt"],
      countryCode: "CA",
      currency: "CAD",
      meta: {
        focus: { at: "2026-10-27T09:00:00.000Z", via: "focus" },
        country: { at: "not a date", via: "chat" },
        goal: { at: "2026-10-27T09:00:00.000Z", via: "telepathy" },
        constructor: { at: "2026-10-27T09:00:00.000Z", via: "plan" },
        nickname: { at: "2026-10-27T09:00:00.000Z", via: "plan" },
      },
    })
    assert.deepEqual(parsed?.focus, ["debt", "home"])
    assert.equal(parsed?.countryCode, "CA")
    assert.equal(parsed?.currency, "CAD")
    assert.deepEqual(parsed?.meta, { focus: { at: "2026-10-27T09:00:00.000Z", via: "focus" } })
  })

  it("leaves out malformed newer fields instead of failing the profile", () => {
    const parsed = parseProfile({ ...STORED_BEFORE, focus: "debt", countryCode: "Canada", currency: "dollars", meta: [1, 2] })
    assert.deepEqual(parsed, STORED_BEFORE)
  })

  it("reads what a newer version might add without failing (unknown fields are dropped)", () => {
    const parsed = parseProfile({ ...STORED_BEFORE, style: "short", declined: ["income"], focus: ["debt"] })
    assert.deepEqual(parsed, { ...STORED_BEFORE, focus: ["debt"] })
  })
})

describe("profileCountryCode and profileCurrency", () => {
  it("prefers the saved code, then the typed name", () => {
    assert.equal(profileCountryCode({ country: "UK" }), "GB")
    assert.equal(profileCountryCode({ country: "Narnia" }), null)
    assert.equal(profileCountryCode({ country: "Narnia", countryCode: "IE" }), "IE")
  })
  it("prefers the saved currency, then the country's", () => {
    assert.equal(profileCurrency({ country: "Ireland" }), "EUR")
    assert.equal(profileCurrency({ country: "Ireland", currency: "GBP" }), "GBP")
    assert.equal(profileCurrency({ country: "" }), null)
  })
})

describe("stampProfile", () => {
  const AT = "2026-10-27T09:00:00.000Z"

  it("a save of one field stamps only the fields that changed, and the save time", () => {
    const previous = { ...EMPTY_PROFILE, updatedAt: "2026-10-01T00:00:00.000Z", goal: "retirement" as const, meta: { goal: { at: "2026-10-01T00:00:00.000Z", via: "focus" as const } } }
    const saved = stampProfile(previous, { ...previous, focus: ["debt"] }, "focus", AT)
    assert.equal(saved.updatedAt, AT)
    assert.deepEqual(saved.meta, { goal: { at: "2026-10-01T00:00:00.000Z", via: "focus" }, focus: { at: AT, via: "focus" } })
  })

  it("a My plan save stamps only what it changed too, and keeps earlier stamps", () => {
    const earlier = "2026-10-01T00:00:00.000Z"
    const previous = { ...EMPTY_PROFILE, updatedAt: earlier, goal: "retirement" as const, meta: { goal: { at: earlier, via: "plan" as const } } }
    const saved = stampProfile(previous, { ...previous, horizonYears: 30 }, "plan", AT)
    assert.deepEqual(saved.meta, { goal: { at: earlier, via: "plan" }, horizonYears: { at: AT, via: "plan" } })
    // Defaults left untouched get no stamp, so experience isn't counted as chosen.
    assert.equal(saved.meta?.experience, undefined)
    assert.equal(experienceChosen(saved), false)
    const picked = stampProfile(saved, { ...saved, experience: "some" }, "plan", "2026-10-28T09:00:00.000Z")
    assert.equal(experienceChosen(picked), true)
  })

  it("stamps against an empty profile on the first save", () => {
    const saved = stampProfile(null, { ...EMPTY_PROFILE, focus: ["debt"] }, "focus", AT)
    assert.deepEqual(saved.meta, { focus: { at: AT, via: "focus" } })
    assert.equal(saved.updatedAt, AT)
  })

  it("adds no stamps when nothing changed", () => {
    for (const via of ["plan", "focus"] as const) {
      assert.equal(stampProfile(EMPTY_PROFILE, { ...EMPTY_PROFILE }, via, AT).meta, undefined, via)
    }
  })

  it("keeps the country, its code and the currency in step", () => {
    const typed = stampProfile(null, { ...EMPTY_PROFILE, country: "the UK" }, "plan", AT)
    assert.equal(typed.countryCode, "GB")
    assert.equal(typed.currency, "GBP")
    assert.equal(typed.country, "the UK")

    const unknown = stampProfile(typed, { ...typed, country: "Narnia" }, "plan", AT)
    assert.equal(unknown.countryCode, undefined)
    assert.equal(unknown.currency, undefined)

    const remembered = stampProfile(null, { ...EMPTY_PROFILE, countryCode: "IE" }, "chat", AT)
    assert.equal(remembered.country, "Ireland")
    assert.equal(remembered.currency, "EUR")
    assert.deepEqual(Object.keys(remembered.meta ?? {}).sort(), ["country", "countryCode", "currency"])
    assert.equal(remembered.meta?.countryCode?.via, "chat")

    const ownCurrency = stampProfile(remembered, { ...remembered, country: "Germany", currency: "USD" }, "plan", AT)
    assert.equal(ownCurrency.countryCode, "DE")
    assert.equal(ownCurrency.currency, "USD")
  })

  it("round-trips through the parser", () => {
    const saved = stampProfile(null, { ...EMPTY_PROFILE, country: "UK", focus: ["saving"], experience: "some" }, "plan", AT)
    assert.deepEqual(parseProfile(JSON.parse(JSON.stringify(saved))), saved)
  })
})

describe("hasPlanDetails and experienceChosen", () => {
  it("doesn't count focus, country or experience as plan details", () => {
    assert.equal(hasPlanDetails(null), false)
    assert.equal(hasPlanDetails({ ...EMPTY_PROFILE, updatedAt: "x", focus: ["debt"], country: "UK", experience: "some" }), false)
    assert.equal(hasPlanDetails({ ...EMPTY_PROFILE, emergencySavings: 0 }), true)
    assert.equal(hasPlanDetails(base), true)
  })
  it("counts experience as chosen only when stamped or not the default", () => {
    assert.equal(experienceChosen(EMPTY_PROFILE), false)
    assert.equal(experienceChosen({ ...EMPTY_PROFILE, experience: "experienced" }), true)
    assert.equal(experienceChosen({ ...EMPTY_PROFILE, meta: { experience: { at: "2026-10-27T09:00:00.000Z", via: "plan" } } }), true)
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

  it("writes amounts in the person's currency, in US dollars until it's known", () => {
    const uk = buildRoadmap({ ...base, country: "UK", emergencySavings: 400 })
    assert.match(uk.nextAction, /£1,100/)
    assert.doesNotMatch(JSON.stringify(uk), /\$/)
    const euro = buildRoadmap({ ...base, country: "Narnia", currency: "EUR", emergencySavings: 400 })
    assert.match(euro.current?.detail ?? "", /€400 of a €1,500 starter buffer/)
    const unknown = buildRoadmap({ ...base, country: "", emergencySavings: 400 })
    assert.match(unknown.nextAction, /\$1,100/)
  })

  it("never writes the 1,000 starter amount in a currency where it would be far too small", () => {
    const unknownEssentials = { ...base, monthlyEssentials: null, emergencySavings: 5000 }
    for (const country of ["Japan", "India", "Nigeria"]) {
      const roadmap = buildRoadmap({ ...unknownEssentials, country })
      const starter = roadmap.steps[0]
      assert.equal(starter.status, "needs-info", country)
      assert.equal(roadmap.current?.id, "starter-buffer", country)
      assert.doesNotMatch(starter.detail, /1,000/, country)
      assert.match(roadmap.nextAction, /monthly essential spending/, country)
    }
    const empty = buildRoadmap({ ...unknownEssentials, country: "Japan", emergencySavings: null })
    assert.doesNotMatch(JSON.stringify(empty.steps[0]), /1,000/)
    // Where 1,000 is about the size of $1,000, it's still the fallback.
    assert.match(buildRoadmap({ ...unknownEssentials, emergencySavings: 400, country: "UK" }).steps[0].detail, /£400 of a £1,000 starter buffer/)
    assert.equal(buildRoadmap({ ...unknownEssentials, country: "" }).steps[0].status, "done")
    // With essentials known, every currency sizes it from them.
    assert.match(buildRoadmap({ ...base, country: "Japan", monthlyEssentials: 200000, emergencySavings: 50000 }).steps[0].detail, /¥50,000 of a ¥200,000/)
  })

  it("treats essentials saved as 0 as an answer, never as not given", () => {
    const zero = { ...base, monthlyEssentials: 0 }
    // Where 1,000 fits the currency, the starter buffer uses it.
    const us = buildRoadmap({ ...zero, emergencySavings: 400 })
    assert.equal(us.steps[0].status, "current")
    assert.match(us.steps[0].detail, /\$400 of a \$1,000 starter buffer/)
    // The full fund can't be sized from 0, and says so instead of asking for the figure.
    const covered = buildRoadmap({ ...zero, emergencySavings: 2000 })
    const full = covered.steps.find((step) => step.id === "full-emergency-fund")
    assert.equal(full?.status, "needs-info")
    assert.match(full?.detail ?? "", /saved as 0/)
    assert.equal(covered.current?.id, "full-emergency-fund")
    assert.match(covered.nextAction, /saved as 0/)
    // Elsewhere it asks to check the 0, not to add essentials.
    const japan = buildRoadmap({ ...zero, country: "Japan", emergencySavings: 5000 })
    assert.equal(japan.steps[0].status, "needs-info")
    assert.match(japan.steps[0].detail, /saved as 0/)
    assert.match(japan.nextAction, /saved as 0/)
    assert.doesNotMatch(japan.steps[0].detail, /1,000/)
    for (const roadmap of [us, covered, japan]) {
      assert.doesNotMatch(JSON.stringify(roadmap), /Add your monthly essential|add your monthly essentials|monthly essential spending and emergency savings/i)
    }
    // With no savings either, it asks for those, and still doesn't call essentials missing.
    const noSavings = buildRoadmap({ ...zero, emergencySavings: null })
    assert.match(noSavings.nextAction, /emergency savings/)
    assert.doesNotMatch(JSON.stringify(noSavings), /Add your monthly essential|monthly essential spending and emergency savings/i)
    // Where 1,000 doesn't fit, adding savings alone can't size the buffer from 0: it says to check the 0.
    for (const country of ["Japan", "India"]) {
      const neither = buildRoadmap({ ...zero, country, emergencySavings: null })
      assert.equal(neither.steps[0].status, "needs-info")
      assert.match(neither.steps[0].detail, /saved as 0, so check that figure, and add your emergency savings/)
      assert.match(neither.nextAction, /saved as 0, so it can't size your starter buffer\. Add your emergency savings too/)
      assert.doesNotMatch(neither.nextAction, /so we can size your starter buffer/)
    }
    // Not given at all there: it asks for both.
    const blank = buildRoadmap({ ...base, country: "Japan", monthlyEssentials: null, emergencySavings: null })
    assert.match(blank.nextAction, /emergency savings and monthly essential spending/)
  })

  it("uses a saved country code for account types", () => {
    const roadmap = buildRoadmap({ ...base, country: "", countryCode: "US", hasTaxAdvantagedAccount: "no" })
    assert.match(roadmap.steps.find((s) => s.id === "tax-advantaged")?.detail ?? "", /Roth IRA/)
  })

  it("doesn't assume US accounts outside the US", () => {
    const roadmap = buildRoadmap({ ...base, country: "Israel", hasTaxAdvantagedAccount: "no" })
    const step = roadmap.steps.find((s) => s.id === "tax-advantaged")
    assert.doesNotMatch(step?.detail ?? "", /Roth/)
    assert.doesNotMatch(roadmap.nextAction, /Roth|401/)
  })
})
