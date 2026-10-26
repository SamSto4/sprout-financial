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

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })

/** "Oct 3, 2026" for a "YYYY-MM-DD" date. */
export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}
