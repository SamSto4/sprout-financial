import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resetLink } from "./reset.ts"
import { legacyLinkRedirect, openTokenLink, pageToken, TOKEN_LINK_PAGES, tokenLinkCookie, tokenLinkCookieName } from "./token-link.ts"
import { verifyLink } from "./verify.ts"

const TOKEN = "A".repeat(42) + "z"
const BASE = "https://sprout.test"

describe("emailed links", () => {
  it("go to each page's /open address, with the token in the query", () => {
    assert.equal(resetLink(BASE, TOKEN), `${BASE}/reset-password/open?token=${TOKEN}`)
    assert.equal(verifyLink(BASE, TOKEN), `${BASE}/verify-email/open?token=${TOKEN}`)
    assert.equal(new URL(resetLink(BASE, TOKEN)).pathname, `${TOKEN_LINK_PAGES.reset}/open`)
    assert.equal(new URL(verifyLink(BASE, TOKEN)).pathname, `${TOKEN_LINK_PAGES.verify}/open`)
  })
})

describe("openTokenLink", () => {
  it("redirects to the page without the token, which it leaves in a cookie for that page only", () => {
    const response = openTokenLink(resetLink(BASE, TOKEN), "reset", true)
    assert.equal(response.status, 303)
    assert.equal(response.headers.get("location"), "/reset-password")
    assert.ok(!response.headers.get("location")?.includes(TOKEN))
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(
      response.headers.get("set-cookie"),
      `__Secure-sprout-reset-link=${TOKEN}; Path=/reset-password; Max-Age=3600; HttpOnly; SameSite=Lax; Secure`
    )
  })

  it("keeps a sign-up link's token for as long as the link works (24 hours)", () => {
    const response = openTokenLink(verifyLink(BASE, TOKEN), "verify", true)
    assert.equal(response.headers.get("location"), "/verify-email")
    assert.match(response.headers.get("set-cookie") ?? "", /^__Secure-sprout-verify-link=A+z; Path=\/verify-email; Max-Age=86400; HttpOnly; SameSite=Lax; Secure$/)
  })

  it("isn't Secure on plain http in development", () => {
    const cookie = openTokenLink(`http://localhost:3000/reset-password/open?token=${TOKEN}`, "reset", false).headers.get("set-cookie")
    assert.equal(cookie, `sprout-reset-link=${TOKEN}; Path=/reset-password; Max-Age=3600; HttpOnly; SameSite=Lax`)
  })

  it("sets no cookie for a missing or malformed token, so the page says the link doesn't work", () => {
    for (const query of ["", "?token=", "?token=short", `?token=${TOKEN}%3B%20Path%3D%2F`, `?token=${TOKEN}x`]) {
      const response = openTokenLink(`${BASE}/reset-password/open${query}`, "reset", true)
      assert.equal(response.status, 303, query)
      assert.equal(response.headers.get("location"), "/reset-password")
      assert.equal(response.headers.get("set-cookie"), null, query)
    }
  })

  it("never takes the redirect's address from the request, so a forged Host can't send it elsewhere", () => {
    const response = openTokenLink(`https://evil.test/reset-password/open?token=${TOKEN}`, "reset", true)
    assert.equal(response.headers.get("location"), "/reset-password")
  })
})

describe("tokenLinkCookie", () => {
  it("names the cookie per kind, with __Secure- over HTTPS", () => {
    assert.equal(tokenLinkCookieName("reset", true), "__Secure-sprout-reset-link")
    assert.equal(tokenLinkCookieName("verify", false), "sprout-verify-link")
    assert.ok(tokenLinkCookie("verify", TOKEN, false).startsWith("sprout-verify-link="))
  })
})

describe("pageToken", () => {
  it("is the token from the link's cookie", () => {
    assert.equal(pageToken(TOKEN), TOKEN)
  })

  it("is null when the cookie is missing or doesn't have the right shape", () => {
    assert.equal(pageToken(undefined), null)
    assert.equal(pageToken("short"), null)
    assert.equal(pageToken(`${TOKEN};`), null)
  })
})

describe("legacyLinkRedirect", () => {
  it("sends a page opened with ?token= (a link from before /open) through /open too", () => {
    assert.equal(legacyLinkRedirect("reset", TOKEN), `/reset-password/open?token=${TOKEN}`)
    assert.equal(legacyLinkRedirect("verify", TOKEN), `/verify-email/open?token=${TOKEN}`)
  })

  it("does nothing when the address has no usable token, so /open's own redirect can't loop", () => {
    for (const value of [undefined, "", "short", ["x", "y"], `${TOKEN}x`]) assert.equal(legacyLinkRedirect("reset", value), null)
    // Following /open's redirect lands on the page with no query at all.
    const location = openTokenLink(resetLink(BASE, TOKEN), "reset", true).headers.get("location") ?? ""
    assert.equal(new URL(location, BASE).search, "")
  })
})
