// Countries Sprout recognizes, with the names people type for them and the currency amounts are
// written in. Account types, tax rules and currency depend on the country, so the assistant and
// the money roadmap use it; anything else typed is kept as text and treated as unknown.
// Only countries: provinces, states and cities are never recognized or stored.
// Pure and tested; safe to share between the browser and the server.

type CountryEntry = {
  /** ISO 3166-1 alpha-2. */
  code: string
  name: string
  /** ISO 4217. */
  currency: string
  /** Other names, written as normalizeName() leaves them (lowercase, no dots, single spaces). */
  aliases: readonly string[]
}

export const COUNTRIES = [
  { code: "US", name: "United States", currency: "USD", aliases: ["united states of america", "usa", "us", "america", "the states"] },
  { code: "CA", name: "Canada", currency: "CAD", aliases: [] },
  { code: "MX", name: "Mexico", currency: "MXN", aliases: ["méxico"] },
  { code: "BR", name: "Brazil", currency: "BRL", aliases: ["brasil"] },
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    aliases: ["uk", "gb", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  },
  { code: "IE", name: "Ireland", currency: "EUR", aliases: ["republic of ireland", "eire", "éire"] },
  { code: "FR", name: "France", currency: "EUR", aliases: [] },
  { code: "DE", name: "Germany", currency: "EUR", aliases: ["deutschland"] },
  { code: "NL", name: "Netherlands", currency: "EUR", aliases: ["holland", "nederland"] },
  { code: "BE", name: "Belgium", currency: "EUR", aliases: [] },
  { code: "ES", name: "Spain", currency: "EUR", aliases: ["españa", "espana"] },
  { code: "PT", name: "Portugal", currency: "EUR", aliases: [] },
  { code: "IT", name: "Italy", currency: "EUR", aliases: ["italia"] },
  { code: "AT", name: "Austria", currency: "EUR", aliases: ["österreich"] },
  { code: "FI", name: "Finland", currency: "EUR", aliases: ["suomi"] },
  { code: "CH", name: "Switzerland", currency: "CHF", aliases: ["schweiz", "suisse"] },
  { code: "SE", name: "Sweden", currency: "SEK", aliases: ["sverige"] },
  { code: "NO", name: "Norway", currency: "NOK", aliases: ["norge"] },
  { code: "DK", name: "Denmark", currency: "DKK", aliases: ["danmark"] },
  { code: "PL", name: "Poland", currency: "PLN", aliases: ["polska"] },
  { code: "IL", name: "Israel", currency: "ILS", aliases: [] },
  { code: "AE", name: "United Arab Emirates", currency: "AED", aliases: ["uae", "emirates"] },
  { code: "IN", name: "India", currency: "INR", aliases: [] },
  { code: "SG", name: "Singapore", currency: "SGD", aliases: [] },
  { code: "PH", name: "Philippines", currency: "PHP", aliases: [] },
  { code: "JP", name: "Japan", currency: "JPY", aliases: [] },
  { code: "AU", name: "Australia", currency: "AUD", aliases: [] },
  { code: "NZ", name: "New Zealand", currency: "NZD", aliases: ["nz", "aotearoa"] },
  { code: "ZA", name: "South Africa", currency: "ZAR", aliases: [] },
  { code: "NG", name: "Nigeria", currency: "NGN", aliases: [] },
  { code: "KE", name: "Kenya", currency: "KES", aliases: [] },
] as const satisfies readonly CountryEntry[]

export type Country = (typeof COUNTRIES)[number]
export type CountryCode = Country["code"]
export type CurrencyCode = Country["currency"]

const BY_CODE = new Map<string, Country>(COUNTRIES.map((country) => [country.code, country]))
const CURRENCIES = new Set<string>(COUNTRIES.map((country) => country.currency))

/** Every name and alias, normalized, to its country. */
const BY_NAME = new Map<string, Country>()
for (const country of COUNTRIES) {
  BY_NAME.set(normalizeName(country.name), country)
  for (const alias of country.aliases) BY_NAME.set(alias, country)
}

/** Lowercase, dots removed ("U.S.A." is "usa"), whitespace collapsed, a leading "the " dropped. */
function normalizeName(text: string): string {
  const plain = text.normalize("NFC").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim()
  // "The States" is an alias in its own right; for everything else "the" is just an article.
  return plain === "the states" ? plain : plain.replace(/^the /, "")
}

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && BY_CODE.has(value)
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CURRENCIES.has(value)
}

export function countryByCode(code: string): Country | null {
  return BY_CODE.get(code) ?? null
}

/**
 * The country a typed name stands for ("UK", "the Netherlands", "U.S.A.", "Deutschland"), or null
 * when it isn't one Sprout knows. A two-letter code counts only in capitals ("DE"), so a short
 * word typed in lowercase ("in", "no") is never read as a country.
 */
export function normalizeCountry(text: string): CountryCode | null {
  if (typeof text !== "string" || text.length > 80) return null
  const trimmed = text.trim()
  if (/^[A-Z]{2}$/.test(trimmed) && BY_CODE.has(trimmed)) return trimmed as CountryCode
  return BY_NAME.get(normalizeName(trimmed))?.code ?? null
}

/**
 * Currencies whose unit is roughly the size of a US dollar (within about two times either way), so
 * a round figure Sprout uses when the person's own isn't known (a 1,000 starter buffer, "an extra
 * 200 this month") still means about the same amount in them. In any other currency (¥, ₹, kr)
 * that figure would be far too small, so code writes no fixed figure and asks for theirs instead.
 */
const DOLLAR_SIZED = new Set<string>(["USD", "CAD", "GBP", "EUR", "CHF", "AUD", "NZD", "SGD"])

/** Whether a fixed round amount set in US dollars may be written in this currency (see DOLLAR_SIZED). */
export function fixedAmountsFit(currency: string): boolean {
  return DOLLAR_SIZED.has(currency)
}

/** The currency amounts are written in for a country, or null for an unknown one. */
export function currencyFor(code: string | null | undefined): CurrencyCode | null {
  return (code && BY_CODE.get(code)?.currency) || null
}

/**
 * The country in a browser locale such as "en-GB", "pt_BR" or "zh-Hant-SG", or null when it names
 * no region or one Sprout doesn't know. Offered as a suggestion only: VPN users and people living
 * abroad often have another country's locale, so it's never picked for them.
 */
export function countryFromLocale(locale: string): CountryCode | null {
  if (typeof locale !== "string" || locale.length > 40) return null
  const match = /^[a-z]{2,3}(?:[-_][a-z]{4})?[-_]([a-z]{2})(?:$|[-_@.])/i.exec(locale.trim())
  const region = match?.[1].toUpperCase()
  return region && BY_CODE.has(region) ? (region as CountryCode) : null
}

/** Whether a typed country is the United States ("US", "USA", "United States", "America"). */
export function isUsCountry(country: string) {
  return normalizeCountry(country) === "US"
}
