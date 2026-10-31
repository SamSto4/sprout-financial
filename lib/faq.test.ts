import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MAX_SESSION_AGE_MS } from "./auth/session-version.ts"
import { MAX_CONTEXT_CHATS } from "./chat/history.ts"
import { LESSONS } from "./learn/course.ts"
import { MAX_SCREENSHOTS } from "./screenshots/image.ts"
import { faqAnswerText, faqGroups, faqItems, HOME_FAQ_IDS, homeFaqLinks, type FaqText } from "./faq.ts"
import type { SiteFeatures } from "./site.ts"

const ALL_ON: SiteFeatures = {
  accounts: true,
  emailConfirmation: true,
  twoFactor: true,
  googleSignIn: true,
  passwordReset: true,
  loginLimits: true,
  marketData: true,
  marketCharts: true,
}

/** Every combination of the switches, including impossible ones such as two-step verification without accounts. */
function everyCombination(): SiteFeatures[] {
  const keys = Object.keys(ALL_ON) as (keyof SiteFeatures)[]
  return Array.from(
    { length: 2 ** keys.length },
    (_, mask) => Object.fromEntries(keys.map((key, bit) => [key, (mask & (1 << bit)) !== 0])) as SiteFeatures
  )
}

const textOf = (features: SiteFeatures) => faqItems(features).map(faqAnswerText).join("\n")
const idsOf = (features: SiteFeatures) => faqItems(features).map((item) => item.id)
const answer = (id: string, features: SiteFeatures = ALL_ON) => {
  const item = faqItems(features).find((candidate) => candidate.id === id)
  assert.ok(item, `no question ${id}`)
  return faqAnswerText(item)
}

function linksOf(features: SiteFeatures): { text: string; href: string }[] {
  const runs: FaqText[] = faqItems(features).flatMap((item) =>
    item.answer.flatMap((block) => (block.type === "p" ? block.text : block.items.flat()))
  )
  return runs.filter((run): run is { text: string; href: string } => typeof run !== "string")
}

const ROUTES = new Set(["/", "/learn", "/plan", "/portfolio", "/assistant", "/dashboard", "/about", "/account", "/login", "/faq"])
const LESSON_SLUGS = new Set(LESSONS.map((lesson) => lesson.slug))

describe("faqGroups", () => {
  it("has 10 to 14 questions however the server is set up", () => {
    for (const features of everyCombination()) {
      const count = faqItems(features).length
      assert.ok(count >= 10 && count <= 14, `${count} questions for ${JSON.stringify(features)}`)
    }
    assert.equal(faqItems(ALL_ON).length, 14)
  })

  it("keeps the three groups, in order", () => {
    for (const features of everyCombination()) {
      assert.deepEqual(
        faqGroups(features).map((group) => group.id),
        ["about-sprout", "your-data", "assistant-and-numbers"]
      )
    }
  })

  it("gives every question and group a unique id that works in a URL", () => {
    const groups = faqGroups(ALL_ON)
    const ids = [...groups.map((group) => group.id), ...idsOf(ALL_ON)]
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("keeps questions and answers short", () => {
    for (const item of faqItems(ALL_ON)) {
      assert.ok(item.question.endsWith("?"), item.question)
      assert.ok(item.question.length <= 60, item.question)
      const text = faqAnswerText(item)
      assert.ok(text.length > 0 && text.length <= 1200, `${item.id}: ${text.length} characters`)
    }
  })

  it("links only to pages and answers that exist", () => {
    for (const features of everyCombination()) {
      const ids = new Set(idsOf(features))
      for (const { href } of linksOf(features)) {
        if (href.startsWith("#")) {
          assert.ok(ids.has(href.slice(1)), `${href} is missing for ${JSON.stringify(features)}`)
          continue
        }
        assert.ok(href.startsWith("/") && !href.startsWith("//"), href)
        const path = href.split(/[?#]/)[0]
        const lesson = path.match(/^\/learn\/(.+)$/)?.[1]
        assert.ok(lesson ? LESSON_SLUGS.has(lesson) : ROUTES.has(path), href)
      }
    }
  })

  it("describes only what this server has switched on", () => {
    for (const features of everyCombination()) {
      const text = textOf(features)
      const ids = idsOf(features)
      const label = JSON.stringify(features)
      if (!features.accounts) {
        assert.ok(!ids.includes("how-is-my-account-protected"), label)
        assert.ok(!text.includes("Account page") && !text.includes("every device") && !text.includes("log in"), label)
      }
      assert.equal(text.includes("two-step"), features.accounts && features.twoFactor, label)
      assert.equal(text.includes("confirmed by email"), features.accounts && features.emailConfirmation, label)
      assert.equal(text.includes("Google"), features.accounts && features.googleSignIn, label)
      assert.equal(text.includes("wrong guesses"), features.accounts && features.loginLimits, label)
      assert.equal(text.includes("resetting your password"), features.accounts && features.passwordReset, label)
      assert.equal(text.includes("Financial Modeling Prep"), features.marketData, label)
      assert.equal(ids.includes("where-does-market-data-come-from"), features.marketData, label)
    }
  })

  it("says past chats are shared unless turned off, and plan sharing starts with the first save", () => {
    const text = answer("what-does-the-ai-see")
    assert.ok(text.includes("on unless you turn off “Let the assistant use past chats”"))
    assert.ok(text.includes("turns on when you first save a plan"))
    assert.ok(text.includes("only once you choose to share them"))
  })

  it("offers Sign out everywhere, and mentions a password reset only where one works", () => {
    const withReset = answer("how-is-my-account-protected")
    assert.ok(withReset.includes("Sign out everywhere"))
    assert.ok(withReset.includes("resetting your password"))
    const withoutReset = answer("how-is-my-account-protected", { ...ALL_ON, passwordReset: false })
    assert.ok(withoutReset.includes("Sign out everywhere"))
    assert.ok(!/reset/i.test(withoutReset), withoutReset)
  })

  it("says how deletion is confirmed, and that other browsers' copies are removed", () => {
    const withCode = answer("how-do-i-delete-my-data")
    assert.ok(withCode.includes("if two-step verification is on, a code from your authenticator app or a recovery code, or log in with Google again if that's the only way you log in)"))
    // Only Google-only accounts can stand a fresh Google login in for the code.
    const noGoogle = answer("how-do-i-delete-my-data", { ...ALL_ON, googleSignIn: false })
    assert.ok(noGoogle.includes("a code from your authenticator app or a recovery code), and Sprout permanently deletes"), noGoogle)
    assert.ok(withCode.includes("Your other devices are signed out, and Sprout removes its copy from each of those browsers the next time it's opened there."))
    assert.ok(!withCode.includes("stays there") && !withCode.includes("until you sign out"))
    const withoutCode = answer("how-do-i-delete-my-data", { ...ALL_ON, twoFactor: false })
    assert.ok(withoutCode.includes("type your email to confirm, and Sprout permanently deletes"))
    assert.ok(!withoutCode.includes("code"), withoutCode)
  })

  it("quotes figures from the code, not typed by hand", () => {
    assert.ok(answer("what-is-sprout").includes(`${LESSONS.length}-lesson course`))
    assert.ok(answer("do-i-have-to-connect-my-bank").includes(`up to ${MAX_SCREENSHOTS} screenshots`))
    assert.ok(answer("what-does-the-ai-see").includes(`up to the ${MAX_CONTEXT_CHATS} most recent`))
    assert.ok(answer("how-is-my-account-protected").includes(`after ${MAX_SESSION_AGE_MS / 86_400_000} days`))
  })

  it("keeps the pricing answer's wording", () => {
    assert.ok(answer("does-sprout-cost-anything").startsWith("Sprout is free to use while it's in development"))
  })
})

describe("faqAnswerText", () => {
  it("keeps a link's words and drops its address", () => {
    const text = answer("will-sprout-tell-me-what-to-buy")
    assert.ok(text.includes("before-you-buy check"))
    assert.ok(!text.includes("/portfolio"))
  })

  it("writes lists as one line per item", () => {
    const lines = answer("what-does-the-ai-see").split("\n").filter((line) => line.startsWith("- "))
    assert.equal(lines.length, 3)
  })
})

describe("homeFaqLinks", () => {
  it("links the same questions, in order, however the server is set up", () => {
    for (const features of everyCombination()) {
      assert.deepEqual(
        homeFaqLinks(features).map((link) => [link.id, link.href]),
        HOME_FAQ_IDS.map((id) => [id, `/faq#${id}`])
      )
    }
  })
})
