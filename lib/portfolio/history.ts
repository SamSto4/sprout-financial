// Big US stock market falls and how long the S&P 500 took to get back to its old high.
// Historical record (S&P 500 price index, peak to low, rounded), used to put a market drop in
// context. Price-only: with dividends reinvested, recoveries were somewhat faster.

export type MarketDrop = {
  name: string
  /** Peak and low, as "Mon YYYY". */
  peak: string
  low: string
  /** Fall from peak to low, as a positive percentage. */
  fallPercent: number
  /** Months from peak to low. */
  monthsDown: number
  /** When the index first closed above its old peak again, as "Mon YYYY". */
  recovered: string
  /** Months from the low back to the old peak. */
  monthsToRecover: number
}

export const MARKET_DROPS: MarketDrop[] = [
  { name: "1973-74 oil shock and inflation", peak: "Jan 1973", low: "Oct 1974", fallPercent: 48, monthsDown: 21, recovered: "Jul 1980", monthsToRecover: 69 },
  { name: "1987 Black Monday", peak: "Aug 1987", low: "Dec 1987", fallPercent: 34, monthsDown: 3, recovered: "Jul 1989", monthsToRecover: 20 },
  { name: "2000-02 dot-com crash", peak: "Mar 2000", low: "Oct 2002", fallPercent: 49, monthsDown: 31, recovered: "May 2007", monthsToRecover: 56 },
  { name: "2007-09 financial crisis", peak: "Oct 2007", low: "Mar 2009", fallPercent: 57, monthsDown: 17, recovered: "Mar 2013", monthsToRecover: 49 },
  { name: "2020 COVID crash", peak: "Feb 2020", low: "Mar 2020", fallPercent: 34, monthsDown: 1, recovered: "Aug 2020", monthsToRecover: 5 },
  { name: "2022 inflation and rate rises", peak: "Jan 2022", low: "Oct 2022", fallPercent: 25, monthsDown: 9, recovered: "Jan 2024", monthsToRecover: 15 },
]

export const MARKET_DROPS_SOURCE =
  "S&P 500 price index, peak-to-low closing levels, rounded. Past recoveries don't guarantee future ones."

/** The drops at least as deep as `percent`, for "it has happened before" context. */
export function dropsAtLeast(percent: number) {
  return MARKET_DROPS.filter((drop) => drop.fallPercent >= percent)
}
