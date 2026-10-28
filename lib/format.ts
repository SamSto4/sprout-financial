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

const dateTimeUtcFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

/** "Oct 27, 2026, 2:05 PM UTC". For emails and tooltips, where the reader's time zone isn't known. */
export function formatDateTimeUtc(date: Date) {
  // Some ICU versions put a narrow no-break space before "PM"; plain-text email clients show it oddly.
  return `${dateTimeUtcFormat.format(date).replace(/ /g, " ")} UTC`
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * "Just now", "5 minutes ago", "3 hours ago", "2 days ago", then "Oct 3, 2026" from a week back.
 * Needs no time zone, so a server-rendered page shows the same thing the reader would work out.
 * A time slightly in the future (clocks a little apart) reads as "Just now".
 */
export function formatTimeAgo(date: Date, now: number) {
  const elapsed = now - date.getTime()
  if (!Number.isFinite(elapsed) || elapsed < MINUTE_MS) return "Just now"
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"} ago`
  if (elapsed < HOUR_MS) return plural(Math.floor(elapsed / MINUTE_MS), "minute")
  if (elapsed < DAY_MS) return plural(Math.floor(elapsed / HOUR_MS), "hour")
  if (elapsed < 7 * DAY_MS) return plural(Math.floor(elapsed / DAY_MS), "day")
  return formatDate(date.toISOString())
}

let regionNames: Intl.DisplayNames | null | undefined

function regions(): Intl.DisplayNames | null {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en-US"], { type: "region" })
    } catch {
      regionNames = null
    }
  }
  return regionNames
}

/** "Germany" for "DE". Null for anything that isn't a known two-letter country code. */
export function countryName(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null
  const name = regions()?.of(code)
  return name && name !== code && name !== "Unknown Region" ? name : null
}
