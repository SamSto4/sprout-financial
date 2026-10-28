// Account and card numbers are never kept: any long number in a transaction or holding description
// is cut to its last four digits, whether it came from a CSV file, a screenshot or storage.
// Pure and tested with `node --test`.

// Card and account numbers: 8 or more digits, maybe split by spaces or dashes. Dates written
// 2026-10-21 have 8 digits too: they're matched first, as themselves, and kept, and a long number
// never runs on into one ("POS 2026-10-21 12:30" keeps its date, "12345678 2026-10-21" too).
const DATE_AHEAD = String.raw`\d{4}-\d{2}-\d{2}(?!\d)`
const LONG_NUMBER = new RegExp(String.raw`(?<!\d)${DATE_AHEAD}|\d(?:(?:[ -](?!${DATE_AHEAD}))?\d){7,}`, "g")
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// Numbers already masked, however the bank or the model wrote it: ****6655, xxxx6655, ••6655. Not
// the end of a word: "TJ MAXX 0567" is a store number, and "LUXX 2025" a name and a year. Nor the
// middle of a run of mask characters, so a long run is read once, not once per character.
const MASKED_NUMBER = /(?<![A-Za-z])(?<![*•]\s?)(?:[*xX•]\s?){2,}(\d{4})\b/g

/**
 * Replaces long account or card numbers with their last four digits, written one way: ••••6655.
 * Masking again changes nothing. Cut untrusted text to a few hundred characters before calling
 * it, as a precaution: it's linear, but runs on every row of an import.
 */
export function maskAccountNumbers(text: string): string {
  return text
    .replace(LONG_NUMBER, (match) => (ISO_DATE.test(match) ? match : `••••${match.replace(/\D/g, "").slice(-4)}`))
    .replace(MASKED_NUMBER, "••••$1")
}
