import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { spotCountry } from "./chat-facts.ts"

const code = (message: string) => spotCountry(message)?.code ?? null

describe("spotCountry", () => {
  it("spots where the person says they live", () => {
    assert.deepEqual(spotCountry("I live in Ireland"), { code: "IE", name: "Ireland" })
    assert.equal(code("I'm in the UK by the way, keep it short"), "GB")
    assert.equal(code("I’m in the UK."), "GB")
    assert.equal(code("We're based in Canada and want to buy a house"), "CA")
    assert.equal(code("I just moved to Germany, how do pensions work?"), "DE")
    assert.equal(code("we live in New Zealand"), "NZ")
    assert.equal(code("I am in the U.S. and 24"), "US")
    assert.equal(code("I'm based in the Netherlands"), "NL")
    assert.equal(code("Hi! I live in Spain"), "ES")
  })
  it("skips negated and hypothetical mentions", () => {
    assert.equal(code("I don't live in the US"), null)
    assert.equal(code("I'm not based in Canada"), null)
    assert.equal(code("If I moved to Australia, could I keep my ISA?"), null)
    assert.equal(code("I used to live in France"), null)
    assert.equal(code("I've never moved to Spain"), null)
    assert.equal(code("I don't live in the US any more, I moved to Ireland"), "IE")
  })
  it("skips a country the person is only visiting, or asks about", () => {
    for (const message of [
      "I'm in Spain for a holiday",
      "I'm in Spain for the week, can I use my card?",
      "We're in Italy on vacation",
      "I'm in Japan on a business trip",
      "I'm in France visiting family",
      "I'm in Germany right now",
      "We're in Portugal this summer",
      "I'm in Germany? No, France",
    ]) {
      assert.equal(code(message), null, message)
    }
    // Where someone lives still counts, with "for" and the like after it.
    assert.equal(code("I live in Spain for tax purposes"), "ES")
    assert.equal(code("I'm in the UK, for context"), "GB")
    assert.equal(code("I'm in Canada and want to retire early"), "CA")
  })
  it("gives nothing for things that only look like a country", () => {
    assert.equal(code("I'm in my Canada Goose jacket"), null)
    assert.equal(code("I'm in Canada Goose"), null)
    assert.equal(code("I'm in Ontario"), null)
    assert.equal(code("I live in New York"), null)
    assert.equal(code("I'm in the US Army"), null)
    assert.equal(code("I'm in India's tech sector"), null)
    assert.equal(code("I'm in debt"), null)
    assert.equal(code("I'm in us"), null)
    assert.equal(code("Canada has TFSAs, right?"), null)
    assert.equal(code("My brother lives in Canada"), null)
  })
  it("gives nothing when two different countries are claimed", () => {
    assert.equal(code("I live in Canada. I'm in the UK."), null)
    assert.equal(code("I live in Canada and I'm based in Canada"), "CA")
  })
  it("ignores masked numbers and odd input", () => {
    assert.equal(code("My card ••••1234 is from the UK"), null)
    assert.equal(spotCountry(""), null)
    assert.equal(code("I live in ".repeat(2000)), null)
  })
})
