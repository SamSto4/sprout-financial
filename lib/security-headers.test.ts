import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "./security-headers.ts"

function directive(name: string) {
  const found = CONTENT_SECURITY_POLICY.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  return found?.split(/\s+/).slice(1) ?? null
}

describe("security headers", () => {
  it("forbids framing the site (clickjacking), in old and new browsers", () => {
    assert.deepEqual(directive("frame-ancestors"), ["'none'"])
    assert.equal(SECURITY_HEADERS.find((header) => header.key === "X-Frame-Options")?.value, "DENY")
  })

  it("doesn't let images or requests reach arbitrary outside hosts", () => {
    for (const name of ["img-src", "connect-src"]) {
      const sources = directive(name)
      assert.ok(sources, `${name} is set`)
      assert.ok(sources.includes("'self'"), `${name} allows the site itself`)
      for (const source of sources) {
        assert.ok(!["*", "https:", "http:", "wss:"].includes(source), `${name} must not allow ${source}`)
      }
    }
  })

  it("keeps data: and blob: images working for inline icons and generated files", () => {
    assert.ok(directive("img-src")?.includes("blob:"))
    assert.ok(directive("img-src")?.includes("data:"))
  })

  it("leaves script-src and style-src alone, so Next.js inline scripts and chart styles keep working", () => {
    assert.equal(directive("script-src"), null)
    assert.equal(directive("style-src"), null)
    assert.equal(directive("default-src"), null)
  })

  it("sends each header once", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key.toLowerCase())
    assert.equal(new Set(keys).size, keys.length)
    for (const key of ["x-content-type-options", "referrer-policy", "strict-transport-security"]) assert.ok(keys.includes(key))
  })
})
