// Masks card, account and ID numbers in what a person types to the assistant, before the message
// is shown, saved, synced or sent. The assistant never needs them (it can't look anything up or
// move money), and a chat is kept in the browser, synced to the account and sent back to the model
// with later questions, so a number typed once would otherwise be stored in all those places.
// Kept free of framework imports so it can be unit-tested with `node --test`.
//
// Only shapes that are almost never anything else are masked, so ordinary amounts, years, dates,
// lists of numbers and phone numbers are left alone. (The screenshot import's maskAccountNumbers
// masks every long number, which suits a screen of transactions but would eat "I have 10000000
// won" here.)
// - card numbers: 13 to 19 digits starting with a digit card networks use (2 to 6, or 8), written
//   together or in the groups printed on cards with the same separator between each, passing the
//   Luhn check
// - Social Security and taxpayer numbers written 123-45-6789, or any 8 to 11 digits right after
//   "SSN", "ITIN", "social security number" and the like
// - account and routing numbers named as such: 6 or more digits after "account number", "acct #",
//   "card no." or "routing", and (for what's being typed, see RedactOptions) 8 or more after a bare
//   "account", "acct" or "card" when no currency or money word follows, written together or, after
//   "acct", in three or more groups of four. "Savings account: 120000" is a balance, so it stays.
// - IBANs, recognized by their own check digits
// Cards and accounts keep their last four digits, the way statements show them (••••1234, the
// same form as the screenshot import). ID numbers are hidden completely.
// Pasted and typed text often writes numbers in other characters: groups separated by a no-break,
// narrow or thin space from a bank's site or a PDF, a tab, an en dash or a fullwidth hyphen, and
// digits typed in fullwidth (as Japanese, Chinese and Korean input methods do), Arabic-Indic or
// Persian. The patterns read a copy with those swapped for a plain space, hyphen or digit, one
// character for one, so what isn't masked keeps the characters the person typed. Line breaks are
// never swapped, so numbers on separate lines (a pasted column of amounts) aren't joined into one.
//
// Every pattern is linear: no two neighbouring parts can match the same characters.

export type Redaction = {
  text: string
  /** How many numbers were masked. */
  masked: number
}

export type RedactOptions = {
  /**
   * Also mask 8 or more digits after a bare "account", "acct", "a/c" or "card" (no "number" or
   * "#"), and three or more groups of four after "acct" or "a/c", the rules that go by shape
   * alone. On by default, for what someone types or sends:
   * the chat says when it masked something. Off when reading chats saved before masking existed,
   * which are rewritten without anyone being told (lib/chat/history.ts).
   */
  unnamedAccounts?: boolean
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

// Characters that stand in for a space, a hyphen or a digit. Each is one UTF-16 unit, like the
// character that replaces it, so the copy the patterns read lines up with the text, position for
// position. Spaces are horizontal ones only: no line breaks.
const SPACE_LIKE = /[\t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g
const DASH_LIKE = /[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g
// Fullwidth, Arabic-Indic and Persian digits. Each set starts at a code point ending in hex 0, so a
// digit's value is its last hex digit.
const OTHER_DIGITS = /[\uff10-\uff19\u0660-\u0669\u06f0-\u06f9]/g

function plainCopy(text: string): string {
  return text
    .replace(SPACE_LIKE, " ")
    .replace(DASH_LIKE, "-")
    .replace(OTHER_DIGITS, (char) => String(char.charCodeAt(0) & 0xf))
}

// Between the digits of a named ID, account or routing number: up to three spaces or hyphens
// ("123 45 6789", "1234  5678", "1234 - 5678"). Neither is a digit, so each gap can only end where
// the next digit starts and the patterns stay linear.
const GAP = "[ -]{0,3}"

// Not part of a longer number: no digit (or decimal part) right before or after. Grouped: 4-4-4-4
// (and 4-4-4-1 up to 4-4-4-7, or 4-4-4-4-3), Amex 4-6-5 and Diners 4-6-4, the same one to three
// spaces, dots or hyphens between every group. `extra` is a short group after the fourth, which
// may be the end of a 19-digit card or something typed after a 16-digit one (a security code).
// A grouped number right after another 4-digit group is in a list of them, so it isn't tried again
// there: a list of 4-digit amounts gets one chance of passing the card check, not one per amount.
const CARD = new RegExp(
  String.raw`(?<![\d.,])(?:[2-68]\d{12,18}|(?<!\d{4}[ .-]{1,3})[2-68]\d{3}(?<sep>[ .-]{1,3})(?:\d{4}\k<sep>\d{4}\k<sep>(?:\d{4}(?<extra>\k<sep>\d{1,3})?|\d{1,3}|\d{5,7})|\d{6}\k<sep>\d{4,5}))(?!\d|[.,]\d)`,
  "g"
)
const DASHED_ID = /(?<![\d-])\d{3}-\d{2}-\d{4}(?!-?\d)/g
const NAMED_ID = new RegExp(
  String.raw`(?<before>\b(?:ssn|itin|sin|tin|social\s+security|social\s+insurance|tax\s*id|taxpayer\s+id)${NUMBER_WORD}${IS_WORD}${SEPARATOR})\d(?:${GAP}\d){7,10}(?!\d)`,
  "gi"
)
// Named as a number: "account number", "acct #", "card no.". "is" only after the name: "the
// account number is 12345678", but not "my account is 150000".
const NAMED_ACCOUNT = new RegExp(
  String.raw`(?<before>\b(?:account|acct|a\/c|routing|aba|card)(?:\s+(?:number|num|nr|no)\b\.?|\s*#)${IS_WORD}${SEPARATOR})(?<number>\d(?:${GAP}\d){5,33})(?!\d|[.,]\d)`,
  "gi"
)
// A routing number is never anything else, so "routing: 021000021" needs no "number".
const ROUTING = new RegExp(String.raw`(?<before>\b(?:routing|aba)${SEPARATOR})(?<number>\d(?:${GAP}\d){5,33})(?!\d|[.,]\d)`, "gi")
// A bare "account 12345678": only 8 or more digits (a balance that long is rarely written without
// commas), not a date, and not followed by a currency or another money word.
const MONEY_WORD = String.raw`(?:dollars?|usd|eur|euros?|gbp|pounds?|yen|jpy|won|krw|rupees?|inr|pesos?|mxn|cad|aud|chf|bucks|balance|limit|left|saved|total)\b`
const UNNAMED_ACCOUNT = new RegExp(
  String.raw`(?<before>\b(?:account|acct|a\/c|card)\s*(?:[:=]{1,3}\s*)?)(?!\d{4}-\d{2}-\d{2}(?!\d))(?<number>\d(?:-?\d){7,33})(?!\d|[.,]\d|-\d|\s*${MONEY_WORD})`,
  "gi"
)
// "acct 1234 5678 9012", the way statements print an account number: only after the abbreviation
// statements use ("acct", "a/c"), in three to eight groups of exactly four digits with the same one
// to three spaces between each, never stopping inside a longer list and not before a money word.
// Amounts after "account" or "card" ("card 1000 2000", "checking account 1200 1500 1800") stay.
const GROUPED_ACCOUNT = new RegExp(
  String.raw`(?<before>\b(?:acct|a\/c)\s*(?:[:=]{1,3}\s*)?)(?<number>\d{4}(?<gap> {1,3})\d{4}(?:\k<gap>\d{4}){1,6}(?!\k<gap>\d))(?!\d|[.,]\d|-\d|\s*${MONEY_WORD})`,
  "gi"
)
// Two letters, two check digits, then groups of up to four letters or digits.
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gi

/** The text and the copy the patterns read, kept in step as numbers are masked in both. */
type Masking = { text: string; plain: string; masked: number }

/**
 * Masks every match of `pattern` in the copy that `mask` returns a replacement for (null keeps
 * it). A match's `before` group (the words naming the number) is kept as the person wrote it, and
 * so are the last `keep` characters when `mask` returns [replacement, keep].
 */
function maskMatches(state: Masking, pattern: RegExp, mask: (match: RegExpExecArray) => string | [string, number] | null) {
  let text = ""
  let plain = ""
  let last = 0
  for (const match of state.plain.matchAll(pattern)) {
    const result = mask(match)
    if (result === null) continue
    const [replacement, keep] = typeof result === "string" ? [result, 0] : result
    const start = match.index + (match.groups?.before?.length ?? 0)
    text += state.text.slice(last, start) + replacement
    plain += state.plain.slice(last, start) + replacement
    last = match.index + match[0].length - keep
    state.masked += 1
  }
  if (last === 0) return
  state.text = text + state.text.slice(last)
  state.plain = plain + state.plain.slice(last)
}

export function redactSensitiveNumbers(input: string, { unnamedAccounts = true }: RedactOptions = {}): Redaction {
  const state: Masking = { text: input, plain: plainCopy(input), masked: 0 }
  maskMatches(state, CARD, (match) => {
    const digits = match[0].replace(/\D/g, "")
    if (passesLuhn(digits)) return lastFour(digits)
    // "4111 1111 1111 1111 123": a 16-digit card, then its security code or a year.
    const extra = match.groups?.extra
    const card = extra ? digits.slice(0, 16) : ""
    return card && passesLuhn(card) ? [lastFour(card), extra!.length] : null
  })
  maskMatches(state, NAMED_ID, () => HIDDEN_ID)
  maskMatches(state, DASHED_ID, () => HIDDEN_ID)
  maskMatches(state, NAMED_ACCOUNT, (match) => lastFour(match.groups?.number ?? ""))
  maskMatches(state, ROUTING, (match) => lastFour(match.groups?.number ?? ""))
  if (unnamedAccounts) {
    maskMatches(state, UNNAMED_ACCOUNT, (match) => lastFour(match.groups?.number ?? ""))
    maskMatches(state, GROUPED_ACCOUNT, (match) => lastFour(match.groups?.number ?? ""))
  }
  maskMatches(state, IBAN, ([match]) => {
    const iban = match.replace(/ /g, "").toUpperCase()
    // A real IBAN's account part is mostly digits; two letters, two digits and some words aren't one.
    if ((iban.slice(4).match(/\d/g)?.length ?? 0) < 6 || !passesIbanCheck(iban)) return null
    return lastFour(iban)
  })
  return { text: state.text, masked: state.masked }
}
