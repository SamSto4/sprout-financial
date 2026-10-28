import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { COUNTRIES, countryFromLocale, currencyFor, isCountryCode, isCurrencyCode, isUsCountry, normalizeCountry } from "./countries.ts"
import { isUsCountry as isUsCountryFromProfile } from "./profile.ts"

describe("COUNTRIES", () => {
  it("has about 25 countries, each with a unique code and a currency", () => {
    assert.ok(COUNTRIES.length >= 25 && COUNTRIES.length <= 35)
    assert.equal(new Set(COUNTRIES.map((country) => country.code)).size, COUNTRIES.length)
    for (const country of COUNTRIES) {
      assert.match(country.code, /^[A-Z]{2}$/)
      assert.match(country.currency, /^[A-Z]{3}$/)
    }
  })
  it("gives every name and alias to one country only", () => {
    const seen = new Map<string, string>()
    for (const country of COUNTRIES) {
      for (const name of [country.name, ...country.aliases]) {
        const owner = normalizeCountry(name)
        assert.equal(owner, country.code, name)
        assert.ok(!seen.has(name.toLowerCase()) || seen.get(name.toLowerCase()) === country.code, name)
        seen.set(name.toLowerCase(), country.code)
      }
    }
  })
})

describe("normalizeCountry", () => {
  it("reads the names people type", () => {
    assert.equal(normalizeCountry("United Kingdom"), "GB")
    assert.equal(normalizeCountry("the UK"), "GB")
    assert.equal(normalizeCountry("England"), "GB")
    assert.equal(normalizeCountry("U.S.A."), "US")
    assert.equal(normalizeCountry("  united   states "), "US")
    assert.equal(normalizeCountry("The Netherlands"), "NL")
    assert.equal(normalizeCountry("Holland"), "NL")
    assert.equal(normalizeCountry("Deutschland"), "DE")
    assert.equal(normalizeCountry("DE"), "DE")
    assert.equal(normalizeCountry("the States"), "US")
  })
  it("gives nothing for regions, cities, lowercase codes and unknown places", () => {
    for (const text of ["Ontario", "California", "London", "in", "no", "de", "", "Atlantis", "Georgia", "x".repeat(200)]) {
      assert.equal(normalizeCountry(text), null, text)
    }
  })
})

describe("currencyFor", () => {
  it("gives each country's currency", () => {
    assert.equal(currencyFor("GB"), "GBP")
    assert.equal(currencyFor("IE"), "EUR")
    assert.equal(currencyFor("CA"), "CAD")
    assert.equal(currencyFor("US"), "USD")
  })
  it("is null for an unknown code or none", () => {
    assert.equal(currencyFor("ZZ"), null)
    assert.equal(currencyFor(null), null)
    assert.equal(currencyFor(undefined), null)
  })
})

describe("countryFromLocale", () => {
  it("reads the region of a browser locale", () => {
    assert.equal(countryFromLocale("en-GB"), "GB")
    assert.equal(countryFromLocale("pt_BR"), "BR")
    assert.equal(countryFromLocale("zh-Hant-SG"), "SG")
    assert.equal(countryFromLocale("en-us"), "US")
    assert.equal(countryFromLocale("de-CH-u-co-phonebk"), "CH")
  })
  it("gives nothing without a known region", () => {
    for (const locale of ["fr", "en", "es-419", "en-XX", "", "nonsense"]) assert.equal(countryFromLocale(locale), null, locale)
  })
})

describe("code checks", () => {
  it("accepts only catalog codes", () => {
    assert.equal(isCountryCode("GB"), true)
    assert.equal(isCountryCode("gb"), false)
    assert.equal(isCountryCode("constructor"), false)
    assert.equal(isCurrencyCode("EUR"), true)
    assert.equal(isCurrencyCode("XYZ"), false)
    assert.equal(isCurrencyCode(5), false)
  })
})

describe("isUsCountry", () => {
  it("matches what the old check did", () => {
    for (const text of ["US", "us", "USA", "U.S.", "U.S.A.", "United States", "united states of america", "America", " usa "]) {
      assert.equal(isUsCountry(text), true, text)
    }
    for (const text of ["", "Canada", "Israel", "usb", "Americas"]) assert.equal(isUsCountry(text), false, text)
  })
  it("is still exported from profile.ts", () => {
    assert.equal(isUsCountryFromProfile, isUsCountry)
  })
})
