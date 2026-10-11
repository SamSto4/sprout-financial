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
