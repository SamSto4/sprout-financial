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
    assert.equal(masked("4111 1111 1111 1111 12/27 123"), "••••1111 12/27 123")
    assert.equal(masked("4111 1111 1111 1111 123"), "••••1111 123")
    assert.equal(masked("6011 0000 0000 0000 001"), "••••0001") // a 19-digit card
    assert.equal(masked("4111\u00a01111\u00a01111\u00a01111\u00a0123"), "••••1111\u00a0123")
  })

  it("masks a card number whatever separates its groups, keeping the rest of the text as typed", () => {
    // Spaces copied from a bank's site or a PDF (no-break, narrow, thin, ideographic), doubled
    // spaces, a tab, dots, and dashes of any kind, with or without spaces around them.
    const spaces = ["  ", "\u00a0", "\u00a0\u00a0", "\u202f", "\u2009", "\u3000", "\t", "."]
    const dashes = ["\u2010", "\u2013", "\u2014", "\u2212", "\uff0d", " - ", " \u2013 "]
    for (const separator of [...spaces, ...dashes]) {
      const number = ["4111", "1111", "1111", "1111"].join(separator)
      assert.deepEqual(redactSensitiveNumbers(`my card ${number} was charged`), { text: "my card ••••1111 was charged", masked: 1 }, JSON.stringify(separator))
      assert.equal(masked(`card ${number}.`), "card ••••1111.", JSON.stringify(separator))
    }
    assert.equal(masked("Amex\u00a03782\u00a0822463\u00a010005"), "Amex\u00a0••••0005")
    assert.equal(masked("line one\n4111\u00a01111\u00a01111\u00a01111\nline\tthree"), "line one\n••••1111\nline\tthree")
    assert.equal(masked("SSN 512\u201344\u20139087, 2020\u20132025"), "SSN •••-••-••••, 2020\u20132025")
  })

  it("leaves lists of amounts and dates alone, even when their digits pass the card check", () => {
    for (const text of [
      "Prices I paid for VTI: 210 225 240 198 233",
      "I got paid 2026-10-01 2026-10-15 and 2026-10-30",
      // Same digits as a valid card number, but not in a card's groups.
      "4111 111 111 111 1111",
      "41 1111 1111 1111 11",
      // Four 4-digit amounts that pass the check, starting with a digit no card number starts with.
      "1200 3400 5600 7806",
      "4111 1111-1111 1111",
    ]) {
      assert.equal(masked(text), text)
    }
    assert.equal(redactSensitiveNumbers("1200340056007806").masked, 0)
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
      "Balances - Checking account: 4500, Savings account: 120000, Brokerage account: 350000",
      "Should I move my high-yield savings account 200000 into VTI?",
      "Credit card: 150000 limit",
      "account: 1500000",
      "savings account: 12000000 won",
      "brokerage account 25000000 dollars",
      "card 10000000 limit",
      "account 2026-10-01",
      // Amounts listed after a bare "account" or "card" are amounts, even in 4-digit groups.
      "Brokerage account 4500 1200",
      "card 1000 2000",
      "My checking account 1200 1500 1800 for the last 3 months",
      "credit card 1500 2000 3000 is what I spent",
    ]) {
      assert.equal(masked(text), text)
    }
  })

  it("masks a bare 'account 12345678' only in what's being typed, not when re-reading saved chats", () => {
    assert.equal(masked("acct 12345678"), "acct ••••5678")
    assert.equal(masked("checking account: 000123456789"), "checking account: ••••6789")
    // After "acct", three or more groups of four, as statements print them, but never part of a
    // list or before a money word.
    assert.equal(masked("acct 1234 5678 9012"), "acct ••••9012")
    assert.equal(masked("acct: 1234  5678  9012"), "acct: ••••9012")
    assert.equal(masked("a/c 1234 5678 9012 3456"), "a/c ••••3456")
    assert.equal(masked("card 1234-5678-9012 was declined"), "card ••••9012 was declined")
    for (const text of [
      "account 1500 2000 dollars",
      "card 1500 2000 limit",
      "account 12 3456 7890",
      "acct 1234 5678-9012",
      "acct 1234 5678",
      "account 1234 5678 9012",
      "acct 1500 2000 2500 dollars",
      "acct 1234 5678  9012",
    ]) {
      assert.equal(masked(text), text)
    }
    assert.equal(redactSensitiveNumbers("acct 12345678", { unnamedAccounts: false }).text, "acct 12345678")
    assert.equal(redactSensitiveNumbers("acct 1234 5678 9012", { unnamedAccounts: false }).text, "acct 1234 5678 9012")
    // Named as a number, a card or an ID: masked either way.
    const strict = (text: string) => redactSensitiveNumbers(text, { unnamedAccounts: false }).text
    assert.equal(strict("account number 12345678"), "account number ••••5678")
    assert.equal(strict("acct #12345678"), "acct #••••5678")
    assert.equal(strict("routing 021000021"), "routing ••••0021")
    assert.equal(strict("4111 1111 1111 1111"), "••••1111")
    assert.equal(strict("SSN 512-44-9087"), "SSN •••-••-••••")
  })

  it("masks an IBAN, checked by its own check digits", () => {
    assert.equal(masked("IBAN GB29 NWBK 6016 1331 9268 19 is mine"), "IBAN ••••6819 is mine")
    assert.equal(masked("DE89370400440532013000"), "••••3000")
    // Same shape, wrong check digits.
    assert.equal(masked("GB28 NWBK 6016 1331 9268 19"), "GB28 NWBK 6016 1331 9268 19")
  })
})

describe("redactSensitiveNumbers: copied and typed in other ways", () => {
  it("masks numbers typed in fullwidth, Arabic-Indic or Persian digits, and leaves other such digits as typed", () => {
    assert.deepEqual(redactSensitiveNumbers("カード４１１１ ２２２２ ３３３３ ４４４４で５００円"), { text: "カード４１１１ ２２２２ ３３３３ ４４４４で５００円", masked: 0 })
    assert.deepEqual(redactSensitiveNumbers("カード４１１１ １１１１ １１１１ １１１１で５００円"), { text: "カード••••1111で５００円", masked: 1 })
    assert.equal(masked("SSN １２３－４５－６７８９"), "SSN •••-••-••••")
    assert.equal(masked("٤١١١١١١١١١١١١١١١"), "••••1111")
    assert.equal(masked("۴۱۱۱ ۱۱۱۱ ۱۱۱۱ ۱۱۱۱"), "••••1111")
    assert.equal(masked("۱۴۰۵"), "۱۴۰۵")
  })

  it("masks ID, account and IBAN numbers copied with no-break spaces", () => {
    assert.equal(masked("my SSN is 123 45 6789"), "my SSN is •••-••-••••")
    assert.equal(masked("SSN 123–45–6789"), "SSN •••-••-••••")
    assert.equal(masked("123–45–6789"), "•••-••-••••")
    assert.equal(masked("acct 1234 5678 9012"), "acct ••••9012")
    assert.equal(masked("IBAN GB29 NWBK 6016 1331 9268 19"), "IBAN ••••6819")
  })

  it("never joins numbers across a line break", () => {
    // A column of amounts pasted one per line is a list, not a card, even when its digits pass the
    // card check: so a card with each group on its own line stays as typed too.
    for (const text of [
      "4111 1111\n1111 1111",
      "acct\n1234\n5678",
      "4111\r\n1111 1111 1111",
      "my card 4111\n1111\n1111\n1111 was charged",
      "Paychecks:\n4111\n1111\n1111\n1111",
      "acct 1234\n5678\n9012",
    ]) {
      assert.equal(masked(text), text)
    }
  })

  it("still leaves dates, phone numbers and amounts alone", () => {
    for (const text of ["2026–2027", "call 555 123 4567", "between 2019 - 2024 I saved 50000", " $1,850 rent"]) {
      assert.equal(masked(text), text)
    }
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
      "1  -".repeat(2000),
      "１　".repeat(2000),
      "acct " + "1 - ".repeat(2000),
      "GB29 " + "AAAA ".repeat(800),
      "account account account ".repeat(150) + "1",
    ]) {
      redactSensitiveNumbers(text)
    }
    assert.ok(performance.now() - started < 500)
  })
})
