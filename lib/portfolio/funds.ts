// Popular funds young investors hold, with only the stable facts: what kind of asset each holds
// and which index it follows. Used to classify holdings and spot overlap. Deliberately no fees or
// prices: those change, so fees come from the user (or the fund's own page) and prices from
// market data.

export const ASSET_CLASSES = {
  "us-stocks": "US stock funds",
  "intl-stocks": "International stock funds",
  "global-stocks": "Global stock funds",
  "single-stock": "Individual stocks",
  "sector-stocks": "Sector & theme funds",
  bonds: "Bond funds",
  cash: "Cash & money market",
  "real-estate": "Real estate funds",
  crypto: "Crypto",
  leveraged: "Leveraged & inverse funds",
  other: "Other",
} as const
export type AssetClass = keyof typeof ASSET_CLASSES

/** Classes that move with the stock market: these count toward the "stocks" share of a mix. */
export const STOCK_LIKE: ReadonlySet<AssetClass> = new Set([
  "us-stocks",
  "intl-stocks",
  "global-stocks",
  "single-stock",
  "sector-stocks",
  "real-estate",
  "leveraged",
])
/** Classes that steady a mix. */
export const STABLE: ReadonlySet<AssetClass> = new Set(["bonds", "cash"])

export type KnownFund = { name: string; assetClass: AssetClass; tracks?: string; broad?: boolean }

const sp500 = "S&P 500"
const usTotal = "US total stock market"
const nasdaq = "Nasdaq-100"
const world = "Global stock market"
const exUs = "International stocks (outside the US)"
const usBonds = "US investment-grade bonds"

export const KNOWN_FUNDS: Record<string, KnownFund> = {
  VOO: { name: "Vanguard S&P 500 ETF", assetClass: "us-stocks", tracks: sp500, broad: true },
  IVV: { name: "iShares Core S&P 500 ETF", assetClass: "us-stocks", tracks: sp500, broad: true },
  SPY: { name: "SPDR S&P 500 ETF Trust", assetClass: "us-stocks", tracks: sp500, broad: true },
  SPLG: { name: "SPDR Portfolio S&P 500 ETF", assetClass: "us-stocks", tracks: sp500, broad: true },
  FXAIX: { name: "Fidelity 500 Index Fund", assetClass: "us-stocks", tracks: sp500, broad: true },
  VFIAX: { name: "Vanguard 500 Index Fund Admiral", assetClass: "us-stocks", tracks: sp500, broad: true },
  SWPPX: { name: "Schwab S&P 500 Index Fund", assetClass: "us-stocks", tracks: sp500, broad: true },
  VTI: { name: "Vanguard Total Stock Market ETF", assetClass: "us-stocks", tracks: usTotal, broad: true },
  ITOT: { name: "iShares Core S&P Total US Stock Market ETF", assetClass: "us-stocks", tracks: usTotal, broad: true },
  SCHB: { name: "Schwab US Broad Market ETF", assetClass: "us-stocks", tracks: usTotal, broad: true },
  VTSAX: { name: "Vanguard Total Stock Market Index Fund Admiral", assetClass: "us-stocks", tracks: usTotal, broad: true },
  FSKAX: { name: "Fidelity Total Market Index Fund", assetClass: "us-stocks", tracks: usTotal, broad: true },
  FZROX: { name: "Fidelity ZERO Total Market Index Fund", assetClass: "us-stocks", tracks: usTotal, broad: true },
  SCHX: { name: "Schwab US Large-Cap ETF", assetClass: "us-stocks", tracks: "US large companies", broad: true },
  QQQ: { name: "Invesco QQQ Trust", assetClass: "sector-stocks", tracks: nasdaq },
  QQQM: { name: "Invesco NASDAQ 100 ETF", assetClass: "sector-stocks", tracks: nasdaq },
  VUG: { name: "Vanguard Growth ETF", assetClass: "us-stocks", tracks: "US large growth companies" },
  SCHG: { name: "Schwab US Large-Cap Growth ETF", assetClass: "us-stocks", tracks: "US large growth companies" },
  SCHD: { name: "Schwab US Dividend Equity ETF", assetClass: "us-stocks", tracks: "US dividend stocks" },
  VYM: { name: "Vanguard High Dividend Yield ETF", assetClass: "us-stocks", tracks: "US dividend stocks" },
  VB: { name: "Vanguard Small-Cap ETF", assetClass: "us-stocks", tracks: "US small companies" },
  VGT: { name: "Vanguard Information Technology ETF", assetClass: "sector-stocks", tracks: "US technology stocks" },
  XLK: { name: "Technology Select Sector SPDR Fund", assetClass: "sector-stocks", tracks: "US technology stocks" },
  ARKK: { name: "ARK Innovation ETF", assetClass: "sector-stocks", tracks: "Actively picked 'innovation' stocks" },
  VT: { name: "Vanguard Total World Stock ETF", assetClass: "global-stocks", tracks: world, broad: true },
  ACWI: { name: "iShares MSCI ACWI ETF", assetClass: "global-stocks", tracks: world, broad: true },
  VXUS: { name: "Vanguard Total International Stock ETF", assetClass: "intl-stocks", tracks: exUs, broad: true },
  IXUS: { name: "iShares Core MSCI Total International Stock ETF", assetClass: "intl-stocks", tracks: exUs, broad: true },
  VEA: { name: "Vanguard FTSE Developed Markets ETF", assetClass: "intl-stocks", tracks: "Developed markets outside the US", broad: true },
  IEFA: { name: "iShares Core MSCI EAFE ETF", assetClass: "intl-stocks", tracks: "Developed markets outside the US", broad: true },
  VWO: { name: "Vanguard FTSE Emerging Markets ETF", assetClass: "intl-stocks", tracks: "Emerging markets", broad: true },
  VTIAX: { name: "Vanguard Total International Stock Index Fund Admiral", assetClass: "intl-stocks", tracks: exUs, broad: true },
  FTIHX: { name: "Fidelity Total International Index Fund", assetClass: "intl-stocks", tracks: exUs, broad: true },
  BND: { name: "Vanguard Total Bond Market ETF", assetClass: "bonds", tracks: usBonds, broad: true },
  AGG: { name: "iShares Core US Aggregate Bond ETF", assetClass: "bonds", tracks: usBonds, broad: true },
  VBTLX: { name: "Vanguard Total Bond Market Index Fund Admiral", assetClass: "bonds", tracks: usBonds, broad: true },
  FXNAX: { name: "Fidelity US Bond Index Fund", assetClass: "bonds", tracks: usBonds, broad: true },
  BNDX: { name: "Vanguard Total International Bond ETF", assetClass: "bonds", tracks: "International bonds", broad: true },
  TLT: { name: "iShares 20+ Year Treasury Bond ETF", assetClass: "bonds", tracks: "Long-term US Treasuries" },
  SHY: { name: "iShares 1-3 Year Treasury Bond ETF", assetClass: "bonds", tracks: "Short-term US Treasuries" },
  SGOV: { name: "iShares 0-3 Month Treasury Bond ETF", assetClass: "cash", tracks: "US Treasury bills" },
  BIL: { name: "SPDR Bloomberg 1-3 Month T-Bill ETF", assetClass: "cash", tracks: "US Treasury bills" },
  VMFXX: { name: "Vanguard Federal Money Market Fund", assetClass: "cash" },
  SPAXX: { name: "Fidelity Government Money Market Fund", assetClass: "cash" },
  VNQ: { name: "Vanguard Real Estate ETF", assetClass: "real-estate", tracks: "US real estate companies (REITs)" },
  GLD: { name: "SPDR Gold Shares", assetClass: "other", tracks: "Gold" },
  IBIT: { name: "iShares Bitcoin Trust ETF", assetClass: "crypto", tracks: "Bitcoin" },
  FBTC: { name: "Fidelity Wise Origin Bitcoin Fund", assetClass: "crypto", tracks: "Bitcoin" },
  BTC: { name: "Bitcoin", assetClass: "crypto", tracks: "Bitcoin" },
  ETH: { name: "Ether", assetClass: "crypto", tracks: "Ether" },
  // Leveraged and inverse funds reset daily and can lose value over time even when the index rises.
  TQQQ: { name: "ProShares UltraPro QQQ (3x)", assetClass: "leveraged", tracks: nasdaq },
  SQQQ: { name: "ProShares UltraPro Short QQQ (-3x)", assetClass: "leveraged", tracks: nasdaq },
  UPRO: { name: "ProShares UltraPro S&P 500 (3x)", assetClass: "leveraged", tracks: sp500 },
  SPXL: { name: "Direxion Daily S&P 500 Bull 3X", assetClass: "leveraged", tracks: sp500 },
  SSO: { name: "ProShares Ultra S&P 500 (2x)", assetClass: "leveraged", tracks: sp500 },
  SOXL: { name: "Direxion Daily Semiconductor Bull 3X", assetClass: "leveraged", tracks: "US semiconductor stocks" },
  TSLL: { name: "Direxion Daily TSLA Bull 2X", assetClass: "leveraged", tracks: "Tesla stock" },
  NVDL: { name: "GraniteShares 2x Long NVDA", assetClass: "leveraged", tracks: "Nvidia stock" },
}

/** Pairs of indexes that hold many of the same companies, with how to describe the overlap. */
export const OVERLAPPING_INDEXES: { a: string; b: string; note: string }[] = [
  { a: sp500, b: usTotal, note: "The S&P 500's companies make up most of the US total market, so these mostly hold the same stocks." },
  { a: sp500, b: nasdaq, note: "Most Nasdaq-100 companies are also in the S&P 500, so this doubles up on large US tech companies." },
  { a: usTotal, b: nasdaq, note: "The Nasdaq-100's companies are all in the US total market, so this doubles up on large US tech companies." },
  { a: world, b: sp500, note: "A global fund already holds the S&P 500's companies as its largest part." },
  { a: world, b: usTotal, note: "A global fund already holds the US market as its largest part." },
  { a: world, b: exUs, note: "A global fund already holds international stocks." },
  { a: "US large companies", b: sp500, note: "Large-company funds and the S&P 500 hold largely the same stocks." },
  { a: "US large growth companies", b: nasdaq, note: "Large growth funds and the Nasdaq-100 share many of the same big tech companies." },
  { a: "US technology stocks", b: nasdaq, note: "The Nasdaq-100 is already heavy in technology companies." },
]

export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.\-^]{0,11}$/

export function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null
  const symbol = value.trim().toUpperCase()
  return SYMBOL_PATTERN.test(symbol) ? symbol : null
}

export function knownFund(symbol: string): KnownFund | null {
  return KNOWN_FUNDS[symbol.toUpperCase()] ?? null
}
