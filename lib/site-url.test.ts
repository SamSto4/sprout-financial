import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { siteUrl as siteUrlFromReset } from "./auth/reset.ts"
import { isIndexable, siteUrl } from "./site-url.ts"

describe("siteUrl", () => {
  it("is still what lib/auth/reset.ts exports for email links", () => {
    assert.equal(siteUrlFromReset, siteUrl)
  })

  it("uses SITE_URL as an origin: no trailing slash, lower-case host, default port dropped", () => {
    assert.equal(siteUrl({ SITE_URL: "https://sprout.example/" }), "https://sprout.example")
    assert.equal(siteUrl({ SITE_URL: "  https://Sprout.Example  " }), "https://sprout.example")
    assert.equal(siteUrl({ SITE_URL: "https://sprout.example:443" }), "https://sprout.example")
    assert.equal(siteUrl({ SITE_URL: "http://localhost:3300" }), "http://localhost:3300")
  })

  it("ignores a SITE_URL that isn't a plain address", () => {
    const fallback = { VERCEL_PROJECT_PRODUCTION_URL: "sprout.vercel.app" }
    for (const bad of [
      "https://evil.test/phish",
      "https://sprout.example/?next=x",
      "https://sprout.example/#top",
      "https://user:pass@sprout.example",
      "https://sprout.example@evil.test",
      "javascript:alert(1)",
      "ftp://sprout.example",
      "sprout.example",
      "https://a&b.example",
      "https://<script>.example",
      "",
    ]) {
      assert.equal(siteUrl({ ...fallback, SITE_URL: bad }), "https://sprout.vercel.app", bad)
    }
  })

  it("uses the preview address on preview deployments, and the production address otherwise", () => {
    const vercel = { VERCEL_URL: "sprout-abc.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "sprout.vercel.app" }
    assert.equal(siteUrl({ ...vercel, VERCEL_ENV: "preview" }), "https://sprout-abc.vercel.app")
    assert.equal(siteUrl({ ...vercel, VERCEL_ENV: "production" }), "https://sprout.vercel.app")
    assert.equal(siteUrl({ ...vercel, VERCEL_ENV: "preview", SITE_URL: "https://sprout.example" }), "https://sprout.example")
  })

  it("falls back to localhost", () => {
    assert.equal(siteUrl({}), "http://localhost:3000")
  })
})

describe("isIndexable", () => {
  it("lets search engines in on Vercel production only", () => {
    assert.equal(isIndexable({ VERCEL_ENV: "production", NODE_ENV: "production" }), true)
    assert.equal(isIndexable({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false)
    assert.equal(isIndexable({ VERCEL_ENV: "development", NODE_ENV: "development" }), false)
  })

  it("off Vercel, follows the build: a production build yes, next dev and tests no", () => {
    assert.equal(isIndexable({ NODE_ENV: "production" }), true)
    assert.equal(isIndexable({ NODE_ENV: "development" }), false)
    assert.equal(isIndexable({ NODE_ENV: "test" }), false)
    assert.equal(isIndexable({}), false)
  })
})
