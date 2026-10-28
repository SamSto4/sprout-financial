import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { securityNoticeEmail, type SecurityNotice, type SecurityNoticeKind } from "./security-email.ts"

const BASE = "https://sprout.test"
const notice = (kind: SecurityNoticeKind, extra: Partial<SecurityNotice> = {}): SecurityNotice => ({
  kind,
  at: new Date("2026-10-27T14:05:00Z"),
  context: { browser: "Chrome", os: "Windows", city: "Berlin", country: "DE" },
  base: BASE,
  hasPassword: true,
  ...extra,
})

describe("securityNoticeEmail", () => {
  it("says what changed, when, and from where", () => {
    const email = securityNoticeEmail("sam@example.com", notice("two_step_off"))
    assert.equal(email.to, "sam@example.com")
    assert.equal(email.subject, "Two-step verification was turned off for your Sprout account")
    assert.match(email.text, /When: Oct 27, 2026, 2:05 PM UTC/)
    assert.match(email.text, /Device: Chrome on Windows/)
    assert.match(email.text, /Approximate location: Berlin, Germany/)
    assert.match(email.text, /Choose a new password: https:\/\/sprout\.test\/forgot-password/)
  })

  it("leaves out the location when it isn't known", () => {
    const email = securityNoticeEmail("sam@example.com", notice("password_changed", { context: {} }))
    assert.match(email.text, /Device: Unknown device/)
    assert.equal(email.text.includes("Approximate location"), false)
  })

  it("gives Google-only accounts advice that doesn't need a password", () => {
    const email = securityNoticeEmail("sam@example.com", notice("two_step_off", { hasPassword: false }))
    assert.equal(email.text.includes("forgot-password"), false)
    assert.match(email.text, /Google account/)
    assert.match(email.text, /https:\/\/sprout\.test\/account/)
  })

  it("links only to plain pages on this site", () => {
    for (const kind of ["two_step_on", "two_step_off", "password_changed", "recovery_code_login", "two_step_attempts", "two_step_code_attempts"] as const) {
      for (const hasPassword of [true, false]) {
        const email = securityNoticeEmail("sam@example.com", notice(kind, { hasPassword }))
        const urls = [...email.text.matchAll(/https?:\/\/\S+/g), ...email.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? match[0])
        assert.ok(urls.length > 0, kind)
        for (const url of urls) assert.ok([`${BASE}/account`, `${BASE}/forgot-password`].includes(url), `${kind}: ${url}`)
      }
    }
  })

  it("escapes everything that came from the request in the HTML", () => {
    // cleanCity would never let this through; the email escapes anyway.
    const email = securityNoticeEmail("sam@example.com", notice("recovery_code_login", { context: { city: `<img src=x onerror=alert(1)>` } }))
    assert.equal(email.html.includes("<img"), false)
    assert.match(email.html, /&#60;img/)
  })

  it("has a distinct subject for each kind", () => {
    const kinds = ["two_step_on", "two_step_off", "password_changed", "recovery_code_login", "two_step_attempts", "two_step_code_attempts"] as const
    const subjects = kinds.map((kind) => securityNoticeEmail("a@b.co", notice(kind)).subject)
    assert.deepEqual(subjects, [
      "Two-step verification was turned on for your Sprout account",
      "Two-step verification was turned off for your Sprout account",
      "Your Sprout password was changed",
      "A recovery code was used to log in to Sprout",
      "Wrong two-step codes were entered for your Sprout account",
      "Wrong two-step codes were entered while logged in to your Sprout account",
    ])
  })

  it("tells the owner when two-step verification is turned on, and how to undo it if it wasn't them", () => {
    const password = securityNoticeEmail("sam@example.com", notice("two_step_on"))
    assert.match(password.text, /logging in with your password now also needs a code/)
    assert.match(password.text, /Choose a new password: https:\/\/sprout\.test\/forgot-password/)
    const google = securityNoticeEmail("sam@example.com", notice("two_step_on", { hasPassword: false }))
    assert.match(google.text, /deleting the account or turning two-step verification off now needs a code/)
    assert.match(google.text, /log in with Google again and turn two-step verification off/)
    assert.match(google.text, /your account page: https:\/\/sprout\.test\/account/)
    assert.equal(google.text.includes("forgot-password"), false)
  })

  it("tells the owner when wrong codes are typed while logged in, and to sign out everywhere", () => {
    const email = securityNoticeEmail("sam@example.com", notice("two_step_code_attempts"))
    assert.match(email.text, /Someone logged in to your Sprout account entered several wrong two-step verification codes/)
    assert.match(email.text, /Nothing was changed/)
    assert.match(email.text, /Sign out everywhere on your account page: https:\/\/sprout\.test\/account/)
    assert.match(email.text, /choose a new password: https:\/\/sprout\.test\/forgot-password/)
    const google = securityNoticeEmail("sam@example.com", notice("two_step_code_attempts", { hasPassword: false }))
    assert.equal(google.text.includes("forgot-password"), false)
    assert.match(google.text, /Google account/)
  })

  it("tells the owner someone has their password when codes keep failing, and how to stop them", () => {
    const email = securityNoticeEmail("sam@example.com", notice("two_step_attempts"))
    assert.match(email.text, /entered your Sprout password correctly, then several wrong two-step verification codes/)
    assert.match(email.text, /Device: Chrome on Windows/)
    assert.match(email.text, /Choose a new password: https:\/\/sprout\.test\/forgot-password/)
    assert.match(email.text, /Two-step verification stays on/)
  })
})
