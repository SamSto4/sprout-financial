import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { EMPTY_PROFILE } from "./plan/profile.ts"
import {
  isUndecided,
  migrateSharing,
  profileStore,
  resetPlanSharing,
  saveProfile,
  shareLessonsStore,
  sharePlanChoiceStore,
  sharePlanReasonStore,
  sharePlanStore,
  sharePortfolioStore,
  updateProfile,
} from "./stores.ts"

// One browser's storage for the whole file: the stores are module-level singletons, so each test
// starts by emptying it and sending the "site data cleared" event they all reload on.
const data = new Map<string, string>()
const target = Object.assign(new EventTarget(), {
  localStorage: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  },
})
Object.defineProperty(globalThis, "window", { value: target, configurable: true, writable: true })

function freshDevice(stored: Record<string, unknown> = {}) {
  data.clear()
  for (const [key, value] of Object.entries(stored)) data.set(key, JSON.stringify(value))
  target.dispatchEvent(Object.assign(new Event("storage"), { key: null }))
}

const AT = "2026-10-27T09:00:00.000Z"

describe("the portfolio switch, split from the plan switch", () => {
  beforeEach(() => freshDevice())

  it("starts with the plan switch's value on a device that had chosen, then stays separate", () => {
    freshDevice({ "sprout-share-plan": true })
    assert.equal(sharePortfolioStore.get(), true)
    sharePlanStore.set(false)
    assert.equal(sharePortfolioStore.get(), true)
  })

  it("keeps an explicit off", () => {
    freshDevice({ "sprout-share-plan": false })
    assert.equal(sharePortfolioStore.get(), false)
  })

  it("copies the old value even when the plan switch changes before the portfolio switch is read", () => {
    freshDevice({ "sprout-share-plan": true })
    sharePlanStore.set(false)
    assert.equal(sharePortfolioStore.get(), true)
  })

  it("is off on a new device, and turning About you on doesn't turn it on", () => {
    assert.equal(sharePortfolioStore.get(), false)
    saveProfile({ ...EMPTY_PROFILE, focus: ["debt"] }, "focus", AT)
    assert.equal(sharePlanStore.get(), true)
    assert.equal(sharePortfolioStore.get(), false)
  })

  it("isn't copied later from a plan switch turned on after the split", () => {
    sharePlanStore.set(true)
    assert.equal(sharePortfolioStore.get(), false)
  })
})

describe("saveProfile", () => {
  beforeEach(() => freshDevice())

  it("turns About you on for an undecided device, once", () => {
    assert.equal(isUndecided(sharePlanChoiceStore), true)
    assert.equal(sharePlanChoiceStore.get(), null)
    assert.deepEqual(saveProfile({ ...EMPTY_PROFILE, goal: "retirement" }, "plan", AT), { sharingTurnedOn: true })
    assert.equal(sharePlanStore.get(), true)
    assert.equal(isUndecided(sharePlanChoiceStore), false)
    assert.deepEqual(saveProfile({ ...EMPTY_PROFILE, goal: "house" }, "plan", AT), { sharingTurnedOn: false })
  })

  it("never overrides an explicit off", () => {
    sharePlanStore.set(false)
    assert.deepEqual(saveProfile({ ...EMPTY_PROFILE, goal: "retirement" }, "plan", AT), { sharingTurnedOn: false })
    assert.equal(sharePlanStore.get(), false)
  })

  it("asks again after the choice is reset (sign-out)", () => {
    sharePlanStore.set(false)
    resetPlanSharing()
    assert.equal(isUndecided(sharePlanChoiceStore), true)
    assert.equal(sharePlanStore.get(), false)
    assert.equal(saveProfile({ ...EMPTY_PROFILE }, "plan", AT).sharingTurnedOn, true)
  })

  it("leaves a device undecided when it already holds a plan (synced from the account)", () => {
    // Sign-in sync writes the account's plan on a device that hasn't been asked.
    profileStore.set({ ...EMPTY_PROFILE, monthlyIncome: 5200, emergencySavings: 9000, updatedAt: AT })
    assert.equal(updateProfile({ focus: ["debt"] }, "focus", AT).sharingTurnedOn, false)
    assert.equal(sharePlanChoiceStore.get(), null)
    assert.equal(sharePlanStore.get(), false)
    assert.deepEqual(profileStore.get()?.focus, ["debt"])
    // An edit on My plan does the same: only the banner opts this device in.
    assert.equal(saveProfile({ ...profileStore.get()!, goal: "house" }, "plan", AT).sharingTurnedOn, false)
    assert.equal(isUndecided(sharePlanChoiceStore), true)
  })

  it("never turns About you on for a removal", () => {
    assert.equal(saveProfile({ ...EMPTY_PROFILE }, "about", AT, { mayTurnOn: false }).sharingTurnedOn, false)
    assert.equal(isUndecided(sharePlanChoiceStore), true)
  })

  it("stamps the changed fields and the save time", () => {
    saveProfile({ ...EMPTY_PROFILE, goal: "retirement" }, "plan", AT)
    updateProfile({ focus: ["debt"] }, "focus", "2026-10-28T10:00:00.000Z")
    const saved = profileStore.get()
    assert.equal(saved?.updatedAt, "2026-10-28T10:00:00.000Z")
    assert.equal(saved?.goal, "retirement")
    assert.deepEqual(saved?.focus, ["debt"])
    // Each save stamped only what it changed.
    assert.deepEqual(saved?.meta, {
      goal: { at: AT, via: "plan" },
      focus: { at: "2026-10-28T10:00:00.000Z", via: "focus" },
    })
  })
})

describe("why About you is on", () => {
  beforeEach(() => freshDevice())

  it("records the save that turned it on, or a choice on the banner or a switch", () => {
    updateProfile({ focus: ["debt"] }, "focus", AT)
    assert.equal(sharePlanStore.get(), true)
    assert.equal(sharePlanReasonStore.get(), "focus")
    sharePlanStore.set(true)
    assert.equal(sharePlanReasonStore.get(), "choice")

    freshDevice()
    updateProfile({ countryCode: "IE" }, "chat", AT)
    assert.equal(sharePlanReasonStore.get(), "chat")

    freshDevice()
    saveProfile({ ...EMPTY_PROFILE, goal: "retirement" }, "plan", AT)
    assert.equal(sharePlanReasonStore.get(), "plan")
  })

  it("a later My plan save stands in for a topic's", () => {
    updateProfile({ focus: ["debt"] }, "focus", AT)
    updateProfile({ focus: ["saving", "debt"] }, "focus", AT)
    assert.equal(sharePlanReasonStore.get(), "focus")
    saveProfile({ ...profileStore.get()!, monthlyIncome: 3000 }, "plan", AT)
    assert.equal(sharePlanReasonStore.get(), "plan")
  })

  it("a plan save never replaces a choice, and resetting forgets the reason", () => {
    sharePlanStore.set(true)
    saveProfile({ ...EMPTY_PROFILE, goal: "retirement" }, "plan", AT)
    assert.equal(sharePlanReasonStore.get(), "choice")
    resetPlanSharing()
    assert.equal(sharePlanReasonStore.get(), null)
    assert.equal(isUndecided(sharePlanReasonStore), true)
  })

  it("records nothing when a save doesn't turn it on", () => {
    sharePlanStore.set(false)
    updateProfile({ focus: ["debt"] }, "focus", AT)
    assert.equal(sharePlanReasonStore.get(), "choice")
    freshDevice({ "sprout-profile": { ...EMPTY_PROFILE, updatedAt: AT, goal: "house" } })
    updateProfile({ focus: ["debt"] }, "focus", AT)
    assert.equal(sharePlanReasonStore.get(), null)
  })
})

describe("an off stored by sign-out before About you", () => {
  beforeEach(() => freshDevice())

  it("reads as undecided when the device has no plan", () => {
    freshDevice({ "sprout-share-plan": false })
    assert.equal(sharePlanChoiceStore.get(), null)
    assert.equal(isUndecided(sharePlanChoiceStore), true)
    assert.equal(sharePortfolioStore.get(), false)
  })

  it("is migrated when sync starts, before the account's plan is merged in", () => {
    freshDevice({ "sprout-share-plan": false })
    migrateSharing()
    profileStore.set({ ...EMPTY_PROFILE, goal: "retirement", updatedAt: AT })
    assert.equal(sharePlanChoiceStore.get(), null)
  })

  it("stays off beside a plan, where it was a choice", () => {
    freshDevice({ "sprout-share-plan": false, "sprout-profile": { ...EMPTY_PROFILE, goal: "retirement", updatedAt: AT } })
    assert.equal(sharePlanChoiceStore.get(), false)
    assert.equal(saveProfile({ ...EMPTY_PROFILE, goal: "house" }, "plan", AT).sharingTurnedOn, false)
  })

  it("is only moved once: an off chosen after the split stays off", () => {
    migrateSharing()
    sharePlanStore.set(false)
    freshDeviceKeep()
    assert.equal(sharePlanChoiceStore.get(), false)
  })
})

/** Sends the "site data changed" event without clearing anything, so every store reloads. */
function freshDeviceKeep() {
  target.dispatchEvent(Object.assign(new Event("storage"), { key: null }))
}

describe("shareLessonsStore", () => {
  beforeEach(() => freshDevice())
  it("is on unless turned off", () => {
    assert.equal(shareLessonsStore.get(), true)
    shareLessonsStore.set(false)
    assert.equal(shareLessonsStore.get(), false)
  })
})
