// Account and card numbers are never kept: any long number in a transaction or holding description
// is cut to its last four digits, whether it came from a CSV file, a screenshot or storage.
// Pure and tested with `node --test`.

// Card and account numbers: 8 or more digits, maybe split by spaces or dashes. Dates written
// 2026-10-21 have 8 digits too, so that exact shape is left alone.
const LONG_NUMBER = /\d(?:[ -]?\d){7,}/g
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// Numbers already masked, however the bank or the model wrote it: ****6655, xxxx6655, ••6655.
const MASKED_NUMBER = /(?:[*xX•]\s?){2,}(\d{4})\b/g

/**
 * Replaces long account or card numbers with their last four digits, written one way: ••••6655.
 * Masking again changes nothing. Cut untrusted text to a few hundred characters before calling
 * it: on a long run of x's the second pattern takes time that grows with the square of the length.
 */
export function maskAccountNumbers(text: string): string {
  return text
    .replace(LONG_NUMBER, (match) => (ISO_DATE.test(match) ? match : `••••${match.replace(/\D/g, "").slice(-4)}`))
    .replace(MASKED_NUMBER, "••••$1")
}
