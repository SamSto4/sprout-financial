// Masks card, account and ID numbers in what a person types to the assistant, before the message
// is shown, saved, synced or sent. The assistant never needs them (it can't look anything up or
// move money), and a chat is kept in the browser, synced to the account and sent back to the model
// with later questions, so a number typed once would otherwise be stored in all those places.
// Kept free of framework imports so it can be unit-tested with `node --test`.
//
// Only shapes that are almost never anything else are masked, so ordinary amounts, years, dates
// and phone numbers are left alone. (The screenshot import's maskAccountNumbers masks every long
// number, which suits a screen of transactions but would eat "I have 10000000 won" here.)
// - card numbers: 13 to 19 digits, maybe grouped by spaces or dashes, passing the Luhn check
// - Social Security and taxpayer numbers written 123-45-6789, or any 8 to 11 digits right after
//   "SSN", "ITIN", "social security number" and the like
// - account and routing numbers: 6 or more digits right after "account", "acct", "routing"...
// - IBANs, recognized by their own check digits
// Cards and accounts keep their last four digits, the way statements show them (••••1234, the
// same form as the screenshot import). ID numbers are hidden completely.
//
// Every pattern is linear: no two neighbouring parts can match the same characters.

export type Redaction = {
  text: string
  /** How many numbers were masked. */
  masked: number
}

const HIDDEN_ID = "•••-••-••••"

/** The way the screenshot import writes a masked number: ••••1234. */
function lastFour(number: string) {
  return `••••${number.replace(/[^0-9A-Za-z]/g, "").slice(-4)}`
}

function passesLuhn(digits: string) {
  let sum = 0
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/** IBAN check digits (ISO 13616): the first four characters go to the end, letters become 10-35, and the number mod 97 is 1. */
function passesIbanCheck(iban: string) {
  let remainder = 0
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const value = char >= "0" && char <= "9" ? char : String(char.charCodeAt(0) - 55)
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

// What may sit between a name and its number: "number"/"no." and "is", then ":", "#" or "=".
// Anything else ("my account has 150000 in it") means the number isn't the account's.
const NUMBER_WORD = String.raw`(?:\s+(?:number|num|nr|no)\b\.?)?`
const IS_WORD = String.raw`(?:\s+(?:is|was)\b)?`
const SEPARATOR = String.raw`\s*(?:[:#=]{1,3}\s*)?`

// Not part of a longer number: no digit (or decimal part) right before or after.
const CARD = /(?<![\d.,])\d(?:[ -]?\d){12,18}(?!\d|[.,]\d)/g
const DASHED_ID = /(?<![\d-])\d{3}-\d{2}-\d{4}(?!-?\d)/g
const NAMED_ID = new RegExp(
  String.raw`(\b(?:ssn|itin|sin|tin|social\s+security|social\s+insurance|tax\s*id|taxpayer\s+id)${NUMBER_WORD}${IS_WORD}${SEPARATOR})(\d(?:[ -]?\d){7,10})(?!\d)`,
  "gi"
)
// "is" only after "number": "the account number is 12345678", but not "my account is 150000".
const NAMED_ACCOUNT = new RegExp(
  String.raw`(\b(?:account|acct|a\/c|routing|aba|card)(?:\s+(?:number|num|nr|no)\b\.?${IS_WORD})?${SEPARATOR})(\d(?:[ -]?\d){5,33})(?!\d|[.,]\d)`,
  "gi"
)
// Two letters, two check digits, then groups of up to four letters or digits.
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gi

export function redactSensitiveNumbers(input: string): Redaction {
  let masked = 0
  const text = input
    .replace(CARD, (match) => {
      const digits = match.replace(/\D/g, "")
      if (!passesLuhn(digits)) return match
      masked += 1
      return lastFour(digits)
    })
    .replace(NAMED_ID, (_match, before: string) => {
      masked += 1
      return `${before}${HIDDEN_ID}`
    })
    .replace(DASHED_ID, () => {
      masked += 1
      return HIDDEN_ID
    })
    .replace(NAMED_ACCOUNT, (_match, before: string, number: string) => {
      masked += 1
      return `${before}${lastFour(number)}`
    })
    .replace(IBAN, (match) => {
      const iban = match.replace(/ /g, "").toUpperCase()
      // A real IBAN's account part is mostly digits; two letters, two digits and some words aren't one.
      if ((iban.slice(4).match(/\d/g)?.length ?? 0) < 6 || !passesIbanCheck(iban)) return match
      masked += 1
      return lastFour(iban)
    })
  return { text, masked }
}
