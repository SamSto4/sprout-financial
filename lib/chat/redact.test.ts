import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { redactSensitiveNumbers } from "./redact.ts"

const masked = (text: string) => redactSensitiveNumbers(text).text

describe("redactSensitiveNumbers: cards", () => {
  it("keeps the last four digits of a card number, grouped or not", () => {
    assert.deepEqual(redactSensitiveNumbers("card 4111 1111 1111 1111 was charged twice"), { text: "card ••••1111 was charged twice", masked: 1 })
    assert.equal(masked("4111-1111-1111-1111"), "••••1111")
    assert.equal(masked("my amex 378282246310005."), "my amex ••••0005.")
    assert.equal(masked("4111111111111111 and 5555555555554444"), "••••1111 and ••••4444")
  })

  it("leaves 16-digit numbers that fail the card check alone, unless named as a card", () => {
    assert.equal(masked("order 4111111111111112 shipped"), "order 4111111111111112 shipped")
    assert.equal(masked("card number 4111 1111 1111 1112"), "card number ••••1112")
  })

  it("doesn't cut a card out of a longer number, and stops before a year that follows", () => {
    assert.equal(masked("ref 41111111111111110000"), "ref 41111111111111110000")
    assert.equal(masked("4111 1111 1111 1111 2026"), "••••1111 2026")
  })
})

describe("redactSensitiveNumbers: ID numbers", () => {
  it("hides a dashed Social Security number completely", () => {
    assert.deepEqual(redactSensitiveNumbers("My SSN is 512-44-9087. Can you pull my credit score?"), {
      text: "My SSN is •••-••-••••. Can you pull my credit score?",
      masked: 1,
    })
    assert.equal(masked("123-45-6789"), "•••-••-••••")
  })

  it("hides undashed ID numbers that follow their name", () => {
    assert.equal(masked("ssn 512449087"), "ssn •••-••-••••")
    assert.equal(masked("Social Security number: 512 44 9087"), "Social Security number: •••-••-••••")
    assert.equal(masked("my SIN is 046 454 286"), "my SIN is •••-••-••••")
    assert.equal(masked("ITIN #912701234"), "ITIN #•••-••-••••")
  })

  it("leaves dates, phone numbers and longer dashed numbers alone", () => {
    for (const text of ["2026-10-27", "call 555-123-4567", "(555) 123-4567", "123-45-67890", "part 9123-45-6789"]) {
      assert.equal(masked(text), text)
    }
  })
})

describe("redactSensitiveNumbers: accounts", () => {
  it("keeps the last four digits of a named account or routing number", () => {
    assert.equal(masked("acct 12345678"), "acct ••••5678")
    assert.equal(masked("The account number is 4417 2290 8831."), "The account number is ••••8831.")
    assert.equal(masked("routing number: 021000021"), "routing number: ••••0021")
    assert.equal(masked("Account #: 0012345678"), "Account #: ••••5678")
    assert.equal(masked("account no. 987654"), "account no. ••••7654")
  })

  it("leaves balances and other amounts near the word 'account' alone", () => {
    for (const text of [
      "my account has 150000 in it",
      "my account is 150000",
      "account balance 150000",
      "my 401k account: $150,000",
      "account 150000.50",
      "I have 3 accounts with 25000 each",
      "acct 12345",
    ]) {
      assert.equal(masked(text), text)
    }
  })

  it("masks an IBAN, checked by its own check digits", () => {
    assert.equal(masked("IBAN GB29 NWBK 6016 1331 9268 19 is mine"), "IBAN ••••6819 is mine")
    assert.equal(masked("DE89370400440532013000"), "••••3000")
    // Same shape, wrong check digits.
    assert.equal(masked("GB28 NWBK 6016 1331 9268 19"), "GB28 NWBK 6016 1331 9268 19")
  })
})

describe("redactSensitiveNumbers: everything else", () => {
  it("leaves ordinary money questions untouched", () => {
    const text = "I earn $84,317 a year, rent is $1,850, and I want to save 10000000 won by 2030. Call me at +1 555 123 4567."
    assert.deepEqual(redactSensitiveNumbers(text), { text, masked: 0 })
  })

  it("is safe to run twice", () => {
    const once = masked("card 4111 1111 1111 1111, SSN 512-44-9087, acct 12345678")
    assert.equal(once, "card ••••1111, SSN •••-••-••••, acct ••••5678")
    assert.deepEqual(redactSensitiveNumbers(once), { text: once, masked: 0 })
  })

  it("stays fast on long hostile input", () => {
    const started = performance.now()
    for (const text of [
      "account" + " ".repeat(4000),
      "ssn number is " + " ".repeat(4000) + "x",
      "1-".repeat(2000),
      "1 ".repeat(2000),
      "GB29 " + "AAAA ".repeat(800),
      "account account account ".repeat(150) + "1",
    ]) {
      redactSensitiveNumbers(text)
    }
    assert.ok(performance.now() - started < 500)
  })
})
