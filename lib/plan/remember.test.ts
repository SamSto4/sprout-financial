import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { EMPTY_PROFILE, type InvestorProfile } from "./profile.ts"
import { countryInSentence, countryOffer, mayOfferToRemember, undoSave } from "./remember.ts"

const REPLY = "Here's how emergency funds usually work in Ireland..."

type Turn = { role: "user" | "assistant"; content: string }
/** A conversation from alternating question and reply texts. */
function chat(...texts: string[]): Turn[] {
  return texts.map((content, index) => ({ role: index % 2 === 0 ? "user" : "assistant", content }))
}
const may = (question: string, reply: string) => mayOfferToRemember(chat(question, reply))

describe("mayOfferToRemember", () => {
  it("allows an offer after an ordinary answer", () => {
    assert.equal(may("I live in Ireland. How big should my emergency fund be?", REPLY), true)
    assert.equal(may("I live in the UK. Is an ISA a tax shelter?", "Yes, an ISA works as a tax shelter."), true)
  })
  it("never offers after a scam reply", () => {
    const reply = "This has the signs of a scam. See [Scams, hype and your own brain](/learn/scams-and-biases)."
    assert.equal(may("I live in Ireland and a man offered me a deal", reply), false)
  })
  it("never offers when the question carries scam signals", () => {
    for (const question of [
      "I'm in the UK, a guy on Telegram says he can double my money in a week",
      "I live in Canada and this site has guaranteed returns of 5% a week",
      "I'm in Ireland, should I send crypto to this account manager?",
      "I live in Canada. Someone on Instagram promised 30% a month returns on a crypto platform if I deposit $2,000. Legit?",
      "I live in Canada. Who should I report him to?",
      "We're in Australia. Is this a scam?",
    ]) {
      assert.equal(may(question, REPLY), false, question)
    }
  })
  it("never offers about money trouble, in the question or the reply", () => {
    for (const question of [
      "I live in Ireland and I can't pay rent this month",
      "I'm in the UK and I'm behind on my bills",
      "We're in Canada and a debt collector keeps calling",
      "I'm in the US and facing eviction",
      "I live in Spain and I'm drowning in debt",
      "I'm in Ireland and I've no money left for food after paying bills this month.",
      "I live in the UK and I'm struggling with debt, I keep missing my card payments and I'm scared.",
      "We're based in Australia, collectors call every day",
    ]) {
      assert.equal(may(question, REPLY), false, question)
    }
    for (const reply of [
      "A nonprofit credit counseling agency can help you make a plan.",
      "Free credit counselling is available.",
      "A free financial counsellor can help: call the National Debt Helpline.",
      "Shelter and Citizens Advice can help, and so can your council.",
      "Report it to the Canadian Anti-Fraud Centre.",
      "A food bank can help this week, and a debt advice charity can help with the rest.",
    ]) {
      assert.equal(may("I live in the UK. What now?", reply), false, reply)
    }
  })
  it("looks at the whole conversation, not just the last exchange", () => {
    const followUps: [string, string, string, string][] = [
      [
        "I can't pay my rent this month and the landlord is threatening to evict me.",
        "I'm sorry you're dealing with this. Let's focus on keeping a roof over your head first.",
        "I'm in the UK by the way. Who can actually help me?",
        "Your council's housing team can help, and it's free.",
      ],
      [
        "A guy on Telegram says he can double my money in a week.",
        "Those are classic warning signs. Please don't send him anything.",
        "I live in Canada. Who should I contact?",
        "You can contact the police and your bank.",
      ],
      [
        "I'm drowning in debt, the calls never stop.",
        "That sounds stressful. Let's take it one step at a time.",
        "We're based in Australia, what free help is there?",
        "There are free services that can help you work out a plan.",
      ],
    ]
    for (const turns of followUps) {
      assert.equal(mayOfferToRemember(chat(...turns)), false, turns[2])
      assert.equal(countryOffer({ messages: chat(...turns), profile: null }), null, turns[2])
    }
    // An ordinary earlier exchange doesn't block one.
    assert.equal(mayOfferToRemember(chat("What's an index fund?", "A fund that follows an index.", "I live in Ireland. Which accounts?", REPLY)), true)
  })
  it("never offers after an empty reply (stopped or failed), or before any reply", () => {
    assert.equal(may("I live in Ireland", "  "), false)
    assert.equal(mayOfferToRemember(chat("I live in Ireland")), false)
    assert.equal(mayOfferToRemember([]), false)
  })
})

describe("countryOffer", () => {
  const ask = "I'm in the UK by the way, keep it short"
  const offer = (question: string, reply: string, profile: InvestorProfile | null, declined?: string[]) =>
    countryOffer({ messages: chat(question, reply), profile, declined })
  it("offers a country the person said they live in, in their latest message", () => {
    assert.deepEqual(offer(ask, REPLY, null), { code: "GB", name: "United Kingdom" })
    assert.equal(countryOffer({ messages: chat(ask, REPLY, "What about pensions?", REPLY), profile: null }), null)
  })
  it("doesn't offer one About you already has, or one turned down in this chat", () => {
    const uk: InvestorProfile = { ...EMPTY_PROFILE, country: "United Kingdom", countryCode: "GB" }
    assert.equal(offer(ask, REPLY, uk), null)
    // Typed on My plan before country codes existed: still known.
    assert.equal(offer(ask, REPLY, { ...EMPTY_PROFILE, country: "UK" }), null)
    assert.equal(offer(ask, REPLY, null, ["GB"]), null)
    assert.ok(offer(ask, REPLY, { ...EMPTY_PROFILE, country: "Ireland" }))
  })
  it("offers nothing on a scam or distress exchange, or without a stated country", () => {
    assert.equal(offer("I'm in the UK and can't pay my rent", REPLY, null), null)
    assert.equal(offer(ask, "See /learn/scams-and-biases", null), null)
    assert.equal(offer("What's an ISA?", REPLY, null), null)
  })
})

describe("undoSave", () => {
  const at = "2026-10-27T10:00:00.000Z"
  it("goes back to no profile when the save created it and nothing else was added", () => {
    const saved: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: at, focus: ["debt"], meta: { focus: { at, via: "focus" } } }
    assert.equal(undoSave(saved, null, "focus"), null)
    const country: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: at, country: "Ireland", countryCode: "IE", currency: "EUR" }
    assert.equal(undoSave(country, null, "country"), null)
  })
  it("puts back only the saved fields, keeping what was saved since", () => {
    const before: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: "2026-10-01T00:00:00.000Z", focus: ["saving"], age: 30 }
    const current: InvestorProfile = { ...before, updatedAt: at, focus: ["debt", "saving"], horizonYears: 12 }
    const undone = undoSave(current, before, "focus")
    assert.deepEqual(undone?.focus, ["saving"])
    assert.equal(undone?.horizonYears, 12)
    assert.equal(undone?.age, 30)
  })
  it("removes a field that didn't exist before", () => {
    const before: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: "2026-10-01T00:00:00.000Z", age: 30 }
    const current: InvestorProfile = { ...before, updatedAt: at, country: "Ireland", countryCode: "IE", currency: "EUR" }
    const undone = undoSave(current, before, "country")
    assert.equal(undone?.country, "")
    assert.equal("countryCode" in (undone ?? {}), false)
    assert.equal("currency" in (undone ?? {}), false)
  })
  it("keeps a profile that gained other details after the save it undoes", () => {
    const current: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: at, focus: ["debt"], goal: "retirement" }
    const undone = undoSave(current, null, "focus")
    assert.ok(undone)
    assert.equal(undone.goal, "retirement")
    assert.equal("focus" in undone, false)
  })
})

describe("undoSave after the profile was deleted", () => {
  it("leaves it deleted instead of bringing the old plan back", () => {
    const before: InvestorProfile = { ...EMPTY_PROFILE, updatedAt: "2026-10-27T10:00:00.000Z", monthlyIncome: 5200, emergencySavings: 9000 }
    assert.equal(undoSave(null, before, "focus"), null)
    assert.equal(undoSave(null, before, "country"), null)
  })
})

describe("countryInSentence", () => {
  it("adds the article where English uses one", () => {
    assert.equal(countryInSentence("United Kingdom"), "the United Kingdom")
    assert.equal(countryInSentence("United States"), "the United States")
    assert.equal(countryInSentence("United Arab Emirates"), "the United Arab Emirates")
    assert.equal(countryInSentence("Netherlands"), "the Netherlands")
    assert.equal(countryInSentence("Philippines"), "the Philippines")
    assert.equal(countryInSentence("Ireland"), "Ireland")
    assert.equal(countryInSentence("New Zealand"), "New Zealand")
  })
})
