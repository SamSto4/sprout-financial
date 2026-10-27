const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatMoney(value: number) {
  return wholeDollars.format(value)
}

/** Short form for chart axes, e.g. $12.5K. */
export function formatMoneyCompact(value: number) {
  return compactDollars.format(value)
}

export function formatPercent(fraction: number, digits = 0) {
  return `${(fraction * 100).toFixed(digits)}%`
}

const preciseDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const plainNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

/** Dollars with cents when there are any, e.g. $15.49 or $1,400. */
export function formatMoneyPrecise(value: number) {
  return preciseDollars.format(value)
}

export function formatNumber(value: number) {
  return plainNumber.format(value)
}

/** Short form for chart axes, e.g. 12.5K. */
export function formatNumberCompact(value: number) {
  return compactNumber.format(value)
}

const dayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
const shortDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

/** "Sat, Oct 3" for a "YYYY-MM-DD" date. Read as UTC, so the day never shifts with the time zone. */
export function formatDay(isoDate: string) {
  return dayFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

/** "Oct 3" for a "YYYY-MM-DD" date. */
export function formatShortDay(isoDate: string) {
  return shortDayFormat.format(new Date(`${isoDate}T00:00:00Z`))
}

/** "Nov 7 – Dec 6" for two "YYYY-MM-DD" dates (a budget month's range). Read as UTC like formatShortDay. */
export function formatDateRange(start: string, end: string) {
  return `${formatShortDay(start)} – ${formatShortDay(end)}`
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "31st". */
export function formatOrdinal(value: number) {
  const n = Math.round(value)
  const lastTwo = n % 100
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"
  return `${n}${suffix}`
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/** "Oct 3, 2026" for a "YYYY-MM-DD" date. */
export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}
