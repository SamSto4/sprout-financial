import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MAX_FOCUS } from "../plan/focus.ts"
import { EMPTY_PROFILE, experienceChosen, parseProfile, stampProfile, type InvestorProfile } from "../plan/profile.ts"
import { mergeNewest } from "./merge.ts"
import { asksAgainAfterMerge, mergeProfiles, profileVersion, type SignInSharing } from "./profile-merge.ts"

const T = (day: number, hour = 12) => `2026-10-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`

/** A full plan saved on My plan, stamped the way saveProfile stamps it. */
function accountPlan(at = T(20), extra: Partial<InvestorProfile> = {}): InvestorProfile {
  return stampProfile(
    null,
    {
      ...EMPTY_PROFILE,
      age: 29,
      country: "United Kingdom",
      goal: "retirement",
      horizonYears: 30,
      experience: "some",
      riskAnswers: [2, 2, 1, 2, 2],
      monthlyIncome: 3100,
      monthlyEssentials: 1800,
      emergencySavings: 2000,
      debts: [{ id: "card", name: "Credit card", balance: 3200, aprPercent: 22, minPayment: 90 }],
      employerMatch: "capturing",
      ...extra,
    },
    "plan",
    at
  )
}

/** What a topic chip saves on a browser with no plan (updateProfile on top of EMPTY_PROFILE). */
const chipOnly = (at = T(27), focus: InvestorProfile["focus"] = ["debt"]) => stampProfile(null, { ...EMPTY_PROFILE, focus }, "focus", at)

/** What Remember on a country saves on a browser with no plan. */
const rememberOnly = (at = T(27)) => stampProfile(null, { ...EMPTY_PROFILE, countryCode: "IE" }, "chat", at)

/** A plan saved by code from before field stamps: no meta, no country code or currency. */
const olderCodePlan = (at = T(10)): InvestorProfile => ({
  ...EMPTY_PROFILE,
  updatedAt: at,
  country: "Canada",
  goal: "house",
  horizonYears: 5,
  monthlyIncome: 4200,
  emergencySavings: 9000,
  debts: [{ id: "car", name: "Car loan", balance: 9000, aprPercent: 6.9, minPayment: 250 }],
})

/** The account's plan details, which a partial save must never change. */
function assertAccountPlanKept(merged: InvestorProfile | null, account: InvestorProfile) {
  assert.ok(merged)
  for (const field of ["age", "goal", "horizonYears", "riskAnswers", "monthlyIncome", "monthlyEssentials", "emergencySavings", "debts", "employerMatch", "hasTaxAdvantagedAccount"] as const) {
    assert.deepEqual(merged[field], account[field], field)
  }
}

/** 1 ms after a save time: how a combined result is dated. */
const after = (at: string) => new Date(Date.parse(at) + 1).toISOString()

/** Merges both ways round (this browser / the account) and checks they agree. */
function bothWays(a: InvestorProfile | null, b: InvestorProfile | null): InvestorProfile | null {
  const ab = mergeProfiles(a, b)
  assert.equal(profileVersion(mergeProfiles(b, a)), profileVersion(ab), "the same whichever side is this browser")
  return ab
}

describe("mergeProfiles: a profile with no plan details never replaces one that has them", () => {
  it("a topic tapped while signed out joins the account's plan, its topics first", () => {
    const account = accountPlan(T(20), { focus: ["investing"] })
    const local = chipOnly(T(27))
    // What sign-in did before: the newer whole profile won, and the plan was gone.
    assert.equal(mergeNewest(local, account)?.monthlyIncome, null)

    const merged = bothWays(local, account)
    assertAccountPlanKept(merged, account)
    assert.deepEqual(merged?.focus, ["debt", "investing"])
    assert.equal(merged?.experience, "some")
    assert.equal(merged?.country, "United Kingdom")
    assert.equal(merged?.countryCode, "GB")
    assert.equal(merged?.currency, "GBP")
    assert.equal(merged?.updatedAt, after(T(27)), "dated just after the later side, so it's the newest copy")
    assert.equal(merged?.meta?.focus?.via, "focus")
    assert.equal(merged?.meta?.monthlyIncome?.via, "plan")
    // It survives storage and sync's parser unchanged.
    assert.deepEqual(parseProfile(JSON.parse(JSON.stringify(merged))), merged)
  })

  it("a country remembered while signed out never replaces the account's, and fills it in when there is none", () => {
    const account = accountPlan()
    const kept = bothWays(rememberOnly(), account)
    assertAccountPlanKept(kept, account)
    assert.equal(kept?.country, "United Kingdom")
    assert.equal(kept?.countryCode, "GB")
    assert.equal(kept?.currency, "GBP")

    const noCountry = accountPlan(T(20), { country: "" })
    assert.equal(noCountry.countryCode, undefined)
    const filled = bothWays(rememberOnly(), noCountry)
    assertAccountPlanKept(filled, noCountry)
    assert.equal(filled?.country, "Ireland")
    assert.equal(filled?.countryCode, "IE")
    assert.equal(filled?.currency, "EUR")
    assert.equal(filled?.meta?.countryCode?.via, "chat")
  })

  it("a currency set on the kept plan without a country keeps it", () => {
    const account = accountPlan(T(20), { country: "", currency: "CAD" })
    const merged = bothWays(rememberOnly(), account)
    assert.equal(merged?.country, "")
    assert.equal(merged?.countryCode, undefined)
    assert.equal(merged?.currency, "CAD")
  })

  it("clearing the topics here while signed out keeps the account's plan", () => {
    const account = accountPlan(T(20), { focus: ["saving"] })
    let local = chipOnly(T(25))
    local = stampProfile(local, { ...local, countryCode: "IE" }, "chat", T(26))
    const cleared = stampProfile(local, { ...local, focus: undefined }, "about", T(27))
    const merged = bothWays(cleared, account)
    assertAccountPlanKept(merged, account)
    // Topics from both sides are kept, so the account's come back: a removal here can't reach them.
    assert.deepEqual(merged?.focus, ["saving"])
    assert.equal(merged?.country, "United Kingdom")
  })

  it("every partial save while signed out, in any order, leaves the account's plan whole", () => {
    const account = accountPlan(T(20), { focus: ["retirement"] })
    let local: InvestorProfile = chipOnly(T(24), ["saving"])
    local = stampProfile(local, { ...local, countryCode: "DE" }, "chat", T(25))
    local = stampProfile(local, { ...local, focus: ["debt", "saving"] }, "focus", T(26))
    local = stampProfile(local, { ...local, focus: undefined }, "about", T(27))
    local = stampProfile(local, { ...local, focus: ["investing"] }, "focus", T(28))
    const merged = bothWays(local, account)
    assertAccountPlanKept(merged, account)
    assert.deepEqual(merged?.focus, ["investing", "retirement"])
    assert.equal(merged?.countryCode, "GB")
  })

  it("a partial profile older than the plan adds its topics after the plan's", () => {
    // Topics tapped on another browser long ago (the account), a plan typed here later.
    const account = chipOnly(T(5), ["saving"])
    const local = accountPlan(T(20), { focus: ["debt"] })
    const merged = bothWays(local, account)
    assertAccountPlanKept(merged, local)
    assert.deepEqual(merged?.focus, ["debt", "saving"])
    assert.equal(merged?.updatedAt, after(T(20)))
    // A stale tap can't push out the newer plan's own topics at the cap.
    const full = accountPlan(T(20), { focus: ["debt", "home", "retirement"] })
    assert.deepEqual(bothWays(full, chipOnly(T(5), ["saving", "investing"]))?.focus, ["debt", "home", "retirement"])
  })

  it("keeps at most MAX_FOCUS topics, each once", () => {
    const account = accountPlan(T(20), { focus: ["retirement", "debt", "saving"] })
    const merged = bothWays(chipOnly(T(27), ["investing", "debt"]), account)
    assert.equal(merged?.focus?.length, MAX_FOCUS)
    assert.deepEqual(merged?.focus, ["investing", "debt", "retirement"])
  })

  it("an experience on a partial side never changes the kept plan's", () => {
    const typedExperience = stampProfile(null, { ...EMPTY_PROFILE, experience: "experienced" }, "plan", T(27))
    const notChosen = { ...olderCodePlan(T(20)) }
    assert.equal(experienceChosen(notChosen), false)
    assert.equal(bothWays(typedExperience, notChosen)?.experience, notChosen.experience)
    assert.equal(bothWays(typedExperience, accountPlan(T(20)))?.experience, "some")
  })

  it("a second device still holding the account's plan takes the combined copy (no flip-flop)", () => {
    // Device X, signed out, remembers Ireland, then signs in: the account's plan (no country) is
    // kept and the country filled in. Device Y still holds the account's plan as it was.
    const account = accountPlan(T(20), { country: "" })
    const onX = mergeProfiles(rememberOnly(T(27)), account)
    assert.equal(onX?.countryCode, "IE")
    const onY = mergeProfiles(account, onX)
    assert.equal(profileVersion(onY), profileVersion(onX), "Y takes X's combined copy")
    assert.equal(mergeProfiles(onX, onY), onX, "and X keeps it: nothing left to upload")
  })

  it("a plan from older code is kept whole against a topic or a country", () => {
    const older = olderCodePlan(T(10))
    for (const partial of [chipOnly(T(27)), rememberOnly(T(27))]) {
      const merged = bothWays(partial, older)
      assertAccountPlanKept(merged, older)
      assert.equal(merged?.country, "Canada")
    }
    assert.deepEqual(bothWays(chipOnly(T(27)), older)?.focus, ["debt"])
    // An older-code profile holding only a typed country is partial too.
    const countryOnly: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: T(28), country: "Canada" }
    assertAccountPlanKept(bothWays(countryOnly, accountPlan(T(20))), accountPlan(T(20)))
  })
})

describe("mergeProfiles: two plans with details", () => {
  it("the newer whole plan wins, defaults included, as before (the 'fresh' case)", () => {
    // The account has a plan with a 22% card; signed out, someone types a complete new plan with
    // income 4000 and no debts, later. Each keystroke is a save.
    const account = accountPlan(T(20), { focus: ["retirement"] })
    let typed = stampProfile(null, { ...EMPTY_PROFILE, monthlyIncome: 4000 }, "plan", T(27, 10))
    typed = stampProfile(typed, { ...typed, goal: "house", horizonYears: 5, emergencySavings: 6000 }, "plan", T(27, 11))
    const merged = bothWays(typed, account)
    assert.ok(merged)
    assert.equal(merged.monthlyIncome, 4000)
    assert.deepEqual(merged.debts, [], "no debts is an answer, not a blank")
    assert.equal(merged.experience, "new")
    assert.equal(merged.employerMatch, "unsure")
    assert.equal(merged.age, null)
    assert.deepEqual(merged.riskAnswers, [])
    assert.equal(merged.country, "", "nothing is filled in from the older plan")
    assert.equal(merged.updatedAt, after(T(27, 11)))
    // Only the topics are combined.
    assert.deepEqual(merged.focus, ["retirement"])
    const withoutTopics = (profile: InvestorProfile | null) => profileVersion(profile && { ...profile, focus: undefined, meta: undefined, updatedAt: "x" })
    assert.equal(withoutTopics(merged), withoutTopics(mergeNewest(typed, account)))
  })

  it("typing one plan detail on My plan while signed out is a newer whole plan, as on main", () => {
    // Age is a plan detail, so the single-field plan replaces the account's on sign-in.
    const account = accountPlan(T(20))
    const ageOnly = stampProfile(null, { ...EMPTY_PROFILE, age: 41 }, "plan", T(27))
    const merged = bothWays(ageOnly, account)
    assert.equal(merged, mergeProfiles(ageOnly, account))
    assert.equal(merged?.age, 41)
    assert.equal(merged?.monthlyIncome, null)
    assert.deepEqual(merged?.debts, [])
    assert.equal(profileVersion(merged), profileVersion(mergeNewest(ageOnly, account)))
  })

  it("newer side's topics come first", () => {
    const older = accountPlan(T(10), { focus: ["saving"] })
    const newer = accountPlan(T(20), { focus: ["debt"], monthlyIncome: 3600 })
    const merged = bothWays(older, newer)
    assert.equal(merged?.monthlyIncome, 3600)
    assert.deepEqual(merged?.focus, ["debt", "saving"])
  })

  it("two plans from older code merge as whole saves did", () => {
    const older = olderCodePlan(T(10))
    const later = { ...olderCodePlan(T(12)), monthlyIncome: null, goal: "retirement" as const }
    assert.equal(mergeProfiles(older, later), later)
    assert.equal(mergeProfiles(later, older), later)
  })
})

describe("mergeProfiles: two profiles without details", () => {
  it("the newer wins, topics combined, gaps filled from the other", () => {
    const older = rememberOnly(T(10))
    const newer = chipOnly(T(20))
    const merged = bothWays(older, newer)
    assert.deepEqual(merged?.focus, ["debt"])
    assert.equal(merged?.countryCode, "IE")
    assert.equal(merged?.updatedAt, after(T(20)))
    const both = bothWays(chipOnly(T(10), ["saving"]), chipOnly(T(20), ["debt"]))
    assert.deepEqual(both?.focus, ["debt", "saving"])
  })
})

describe("mergeProfiles: sides missing or the same", () => {
  it("returns a side itself when nothing changes, and handles missing sides", () => {
    const plan = accountPlan()
    assert.equal(mergeProfiles(null, plan), plan)
    assert.equal(mergeProfiles(plan, null), plan)
    assert.equal(mergeProfiles(null, null), null)
    assert.equal(mergeProfiles({ ...EMPTY_PROFILE }, plan), plan)
    assert.equal(mergeProfiles(plan, { ...plan }), plan)
    const older = accountPlan(T(1))
    const newer = stampProfile(older, { ...older, age: 30 }, "plan", T(3))
    assert.equal(mergeProfiles(older, newer), newer)
    assert.equal(mergeProfiles(newer, older), newer)
    // A topic the account already has changes nothing.
    const withTopic = accountPlan(T(20), { focus: ["debt"] })
    assert.equal(mergeProfiles(chipOnly(T(27)), withTopic), withTopic)
  })
})

describe("profileVersion", () => {
  it("is the same for equal profiles whatever their key order, and empty for none", () => {
    const plan = accountPlan()
    const reordered = Object.fromEntries(Object.entries(plan).reverse()) as InvestorProfile
    assert.equal(profileVersion(reordered), profileVersion(plan))
    assert.notEqual(profileVersion({ ...plan, age: 40 }), profileVersion(plan))
    assert.equal(profileVersion(null), "")
  })
})

describe("asksAgainAfterMerge", () => {
  const account = accountPlan(T(20))
  const input = (overrides: Partial<SignInSharing>): SignInSharing => {
    const local = chipOnly()
    return {
      reason: "focus",
      profileBefore: local,
      profileAfter: mergeProfiles(local, account),
      lessonsBefore: [],
      lessonsAfter: [],
      lessonsShared: true,
      ...overrides,
    }
  }

  it("asks again when a topic or Remember turned About you on and the account brings plan details", () => {
    for (const reason of ["focus", "chat", "quick"] as const) {
      assert.equal(asksAgainAfterMerge(input({ reason })), true, reason)
    }
    // Also when the browser's own details went (Clear my plan) and the account's arrive.
    assert.equal(asksAgainAfterMerge(input({ profileBefore: null, profileAfter: account })), true)
    // Or only topics the account had.
    const local = chipOnly(T(27))
    assert.equal(asksAgainAfterMerge(input({ profileBefore: local, profileAfter: mergeProfiles(local, chipOnly(T(1), ["saving"])) })), true)
  })

  it("asks again when the account brings finished lessons that would be sent", () => {
    const local = chipOnly()
    const unchanged = { profileBefore: local, profileAfter: local }
    assert.equal(asksAgainAfterMerge(input({ ...unchanged, lessonsBefore: ["what-is-investing"], lessonsAfter: ["what-is-investing", "index-funds"] })), true)
    // Not while finished lessons are left out of About you here, nor when nothing new arrives.
    assert.equal(asksAgainAfterMerge(input({ ...unchanged, lessonsAfter: ["index-funds"], lessonsShared: false })), false)
    assert.equal(asksAgainAfterMerge(input({ ...unchanged, lessonsBefore: ["index-funds"], lessonsAfter: ["index-funds"] })), false)
  })

  it("doesn't ask when the account brings nothing this browser didn't have", () => {
    const local = chipOnly()
    assert.equal(asksAgainAfterMerge(input({ profileBefore: local, profileAfter: local })), false)
    assert.equal(asksAgainAfterMerge(input({ profileBefore: local, profileAfter: mergeProfiles(local, null) })), false)
    assert.equal(asksAgainAfterMerge(input({ profileBefore: local, profileAfter: mergeProfiles(local, chipOnly(T(1))) })), false)
  })

  it("keeps a choice made on the banner or a switch, a plan save's, and one from before reasons were kept", () => {
    for (const reason of ["choice", "plan", null] as const) {
      assert.equal(asksAgainAfterMerge(input({ reason, lessonsAfter: ["index-funds"] })), false, String(reason))
    }
  })
})
