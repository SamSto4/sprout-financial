import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { describeLink } from "./links.ts"

describe("describeLink", () => {
  it("treats paths on this site as internal", () => {
    assert.deepEqual(describeLink("/learn/starting-early", "Starting early"), { kind: "internal", host: null })
    assert.deepEqual(describeLink("#sources", "Sources"), { kind: "internal", host: null })
  })
  it("names the other site unless the text already does", () => {
    assert.deepEqual(describeLink("https://www.investor.gov/compound", "Compound interest calculator"), { kind: "external", host: "investor.gov" })
    assert.deepEqual(describeLink("https://www.investor.gov/compound", "Investor.gov calculator"), { kind: "external", host: null })
    assert.deepEqual(describeLink("http://example.com", "https://example.com"), { kind: "external", host: null })
    assert.deepEqual(describeLink("https://www.sec.gov/x", "See www.SEC.gov."), { kind: "external", host: null })
  })
  it("names the site when the text only contains it inside a longer name", () => {
    assert.deepEqual(describeLink("https://evil.example/login", "evil.example.bank.com"), { kind: "external", host: "evil.example" })
    assert.deepEqual(describeLink("https://bank.com.evil.example/login", "bank.com"), { kind: "external", host: "bank.com.evil.example" })
    assert.deepEqual(describeLink("https://evil.example/login", "myevil.example"), { kind: "external", host: "evil.example" })
  })
  it("stays fast on long hostile link text", () => {
    const started = performance.now()
    const info = describeLink("https://evil.example", ".".repeat(50_000) + "x" + "a-".repeat(50_000))
    assert.equal(info.host, "evil.example")
    assert.ok(performance.now() - started < 500)
  })
  it("shows look-alike hosts in their real (punycode) form", () => {
    assert.deepEqual(describeLink("https://аpple.com/login", "Apple"), { kind: "external", host: "xn--pple-43d.com" })
  })
  it("counts protocol-relative and backslash links as the other sites they open", () => {
    assert.deepEqual(describeLink("//evil.example/x", "Your plan"), { kind: "external", host: "evil.example" })
    assert.deepEqual(describeLink("/\\evil.example", "Your plan"), { kind: "external", host: "evil.example" })
  })
  it("leaves mail links and missing hrefs plain", () => {
    assert.deepEqual(describeLink("mailto:help@example.com", "Email us"), { kind: "other", host: null })
    assert.deepEqual(describeLink(undefined, "x"), { kind: "other", host: null })
    assert.deepEqual(describeLink("", "x"), { kind: "other", host: null })
  })
})
