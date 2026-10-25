// The investor profile: what the user tells Sprout about their goals and finances, a short risk
// quiz, and the rule-of-thumb stock range that follows from them. Pure and tested, shared by the
// browser (forms, storage, sync) and the server (the assistant's tools).

export const GOALS = {
  retirement: "Retirement",
  wealth: "Long-term wealth",
  house: "Buying a home",
  education: "Education",
  big_purchase: "A big purchase (car, travel, wedding)",
  not_sure: "Not sure yet",
} as const
export type Goal = keyof typeof GOALS

export const EXPERIENCE = {
  new: "Brand new to investing",
  some: "I've invested a little",
  experienced: "I invest regularly",
} as const
export type Experience = keyof typeof EXPERIENCE

export const MATCH_STATUS = {
  capturing: "Yes, and I contribute enough to get all of it",
  missing: "Yes, but I don't contribute enough to get all of it",
  unsure: "I'm not sure",
  none: "No match, or no workplace retirement plan",
} as const
export type MatchStatus = keyof typeof MATCH_STATUS

export const YES_NO_UNSURE = { yes: "Yes", no: "No", unsure: "Not sure" } as const
export type YesNoUnsure = keyof typeof YES_NO_UNSURE

export type Debt = {
  id: string
  name: string
  balance: number
  /** Yearly interest rate as a percentage, e.g. 24 for 24%. */
  aprPercent: number
  minPayment: number
}

export type InvestorProfile = {
  updatedAt: string
  age: number | null
  /** ISO-style country name as typed, e.g. "United States". Account types and taxes depend on it. */
  country: string
  goal: Goal
  /** Years until the money for the main goal is needed. */
  horizonYears: number | null
  experience: Experience
  /** One answer per RISK_QUESTIONS entry, 0 (most cautious) to 3; empty until the quiz is taken. */
  riskAnswers: number[]
  monthlyIncome: number | null
  monthlyEssentials: number | null
  emergencySavings: number | null
  debts: Debt[]
  employerMatch: MatchStatus
  hasTaxAdvantagedAccount: YesNoUnsure
}

export const EMPTY_PROFILE: InvestorProfile = {
  updatedAt: "",
  age: null,
  country: "",
  goal: "not_sure",
  horizonYears: null,
  experience: "new",
  riskAnswers: [],
  monthlyIncome: null,
  monthlyEssentials: null,
  emergencySavings: null,
  debts: [],
  employerMatch: "unsure",
  hasTaxAdvantagedAccount: "unsure",
}

/** Debt above this yearly rate is "high-interest": paying it off beats the return investing can expect. */
export const HIGH_INTEREST_APR = 8
export const MAX_DEBTS = 12

// ---------------------------------------------------------------------------------------------
// Risk quiz. Each answer scores 0-3; the total (0-15) sets a risk level.

export const RISK_QUESTIONS = [
  {
    id: "drop",
    question: "Your investments fall 25% in a few months. What do you do?",
    answers: ["Sell everything so it can't fall further", "Sell some", "Hold and wait", "Invest more while prices are lower"],
  },
  {
    id: "priority",
    question: "Which matters more to you?",
    answers: [
      "Not losing money, even if it grows slowly",
      "Mostly safety, with a little growth",
      "Mostly growth, with some safety",
      "Growth, even with big ups and downs",
    ],
  },
  {
    id: "sleep",
    question: "How would a $1,000 investment swinging between $700 and $1,400 in a year feel?",
    answers: ["I'd lose sleep", "Uncomfortable", "Fine, that's investing", "Exciting"],
  },
  {
    id: "stability",
    question: "How steady is your income?",
    answers: ["Unsteady or none right now", "Somewhat steady", "Steady", "Very steady, with savings to spare"],
  },
  {
    id: "knowledge",
    question: "How well do you understand how stocks and funds work?",
    answers: ["Not at all yet", "A little", "Fairly well", "Very well"],
  },
] as const

export type RiskLevel = "conservative" | "moderate" | "growth" | "aggressive"

export const RISK_LABELS: Record<RiskLevel, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  growth: "Growth",
  aggressive: "Aggressive",
}

export function riskScore(answers: readonly number[]): number | null {
  if (answers.length !== RISK_QUESTIONS.length) return null
  return answers.reduce((sum, answer) => sum + answer, 0)
}

export function riskLevel(answers: readonly number[]): RiskLevel | null {
  const score = riskScore(answers)
  if (score === null) return null
  if (score <= 4) return "conservative"
  if (score <= 8) return "moderate"
  if (score <= 12) return "growth"
  return "aggressive"
}

// ---------------------------------------------------------------------------------------------
// Target mix: a common rule-of-thumb range for the share of investments in stocks (stock funds),
// from how soon the money is needed and how much ups and downs the user can live with. Money
// needed within a few years mostly stays out of stocks whatever the appetite for risk.

export type StockRange = { min: number; max: number }

const RANGES: Record<"short" | "medium" | "long" | "veryLong", Record<RiskLevel, StockRange>> = {
  short: {
    conservative: { min: 0, max: 10 },
    moderate: { min: 0, max: 20 },
    growth: { min: 10, max: 30 },
    aggressive: { min: 10, max: 30 },
  },
  medium: {
    conservative: { min: 20, max: 40 },
    moderate: { min: 30, max: 50 },
    growth: { min: 40, max: 60 },
    aggressive: { min: 50, max: 70 },
  },
  long: {
    conservative: { min: 30, max: 50 },
    moderate: { min: 50, max: 70 },
    growth: { min: 60, max: 80 },
    aggressive: { min: 70, max: 90 },
  },
  veryLong: {
    conservative: { min: 40, max: 60 },
    moderate: { min: 60, max: 80 },
    growth: { min: 75, max: 95 },
    aggressive: { min: 85, max: 100 },
  },
}

export type HorizonBand = keyof typeof RANGES

export function horizonBand(years: number): HorizonBand {
  if (years < 3) return "short"
  if (years < 6) return "medium"
  if (years < 11) return "long"
  return "veryLong"
}

export const HORIZON_LABELS: Record<HorizonBand, string> = {
  short: "under 3 years",
  medium: "3 to 5 years",
  long: "6 to 10 years",
  veryLong: "more than 10 years",
}

/** The stock range for this profile, or null until both the horizon and the quiz are filled in. */
export function targetStockRange(profile: Pick<InvestorProfile, "horizonYears" | "riskAnswers">): StockRange | null {
  const level = riskLevel(profile.riskAnswers)
  if (level === null || profile.horizonYears === null) return null
  return RANGES[horizonBand(profile.horizonYears)][level]
}

// ---------------------------------------------------------------------------------------------

export function highInterestDebts(profile: Pick<InvestorProfile, "debts">): Debt[] {
  return profile.debts
    .filter((debt) => debt.balance > 0 && debt.aprPercent >= HIGH_INTEREST_APR)
    .sort((a, b) => b.aprPercent - a.aprPercent)
}

/** What's still blank, so the assistant can ask for it (a couple at a time) instead of guessing. */
export function missingDetails(profile: InvestorProfile): string[] {
  const missing: string[] = []
  if (!profile.country.trim()) missing.push("country")
  if (profile.goal === "not_sure") missing.push("main goal")
  if (profile.horizonYears === null) missing.push("time horizon")
  if (riskLevel(profile.riskAnswers) === null) missing.push("risk quiz")
  if (profile.emergencySavings === null) missing.push("emergency savings")
  if (profile.monthlyEssentials === null) missing.push("monthly essential spending")
  if (profile.monthlyIncome === null) missing.push("monthly take-home income")
  if (profile.employerMatch === "unsure") missing.push("employer retirement match")
  return missing
}

export function isUsCountry(country: string) {
  return /^(us|usa|u\.s\.a?\.?|united states( of america)?|america)$/i.test(country.trim())
}

// ---------------------------------------------------------------------------------------------
// Parsing: storage, sync and the chat request all go through this, so bad or hostile data never
// reaches the calculations.

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

function oneOf<T extends string>(value: unknown, options: Record<T, string>, fallback: T): T {
  return typeof value === "string" && Object.hasOwn(options, value) ? (value as T) : fallback
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

const ID_PATTERN = /^[a-z0-9-]{1,40}$/

export function parseDebt(raw: unknown): Debt | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const balance = num(record.balance, 0, 10_000_000)
  const apr = num(record.aprPercent, 0, 100)
  if (balance === null || apr === null) return null
  return {
    id: typeof record.id === "string" && ID_PATTERN.test(record.id) ? record.id : `debt-${Math.round(balance)}-${Math.round(apr * 100)}`,
    name: text(record.name, 60) || "Debt",
    balance,
    aprPercent: apr,
    minPayment: num(record.minPayment, 0, 1_000_000) ?? 0,
  }
}

export function parseProfile(raw: unknown): InvestorProfile | null {
  if (typeof raw !== "object" || raw === null) return null
  const record = raw as Record<string, unknown>
  const answers = Array.isArray(record.riskAnswers) ? record.riskAnswers : []
  const riskAnswers =
    answers.length === RISK_QUESTIONS.length && answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer <= 3)
      ? (answers as number[])
      : []
  const age = num(record.age, 13, 110)
  const horizon = num(record.horizonYears, 0, 60)
  return {
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.length <= 40 ? record.updatedAt : "",
    age: age === null ? null : Math.round(age),
    country: text(record.country, 60),
    goal: oneOf(record.goal, GOALS, "not_sure"),
    horizonYears: horizon === null ? null : Math.round(horizon),
    experience: oneOf(record.experience, EXPERIENCE, "new"),
    riskAnswers,
    monthlyIncome: num(record.monthlyIncome, 0, 1_000_000),
    monthlyEssentials: num(record.monthlyEssentials, 0, 1_000_000),
    emergencySavings: num(record.emergencySavings, 0, 100_000_000),
    debts: (Array.isArray(record.debts) ? record.debts : [])
      .slice(0, MAX_DEBTS)
      .map(parseDebt)
      .filter((debt): debt is Debt => debt !== null),
    employerMatch: oneOf(record.employerMatch, MATCH_STATUS, "unsure"),
    hasTaxAdvantagedAccount: oneOf(record.hasTaxAdvantagedAccount, YES_NO_UNSURE, "unsure"),
  }
}

/** Whether the user has filled in anything at all. */
export function hasProfile(profile: InvestorProfile | null): profile is InvestorProfile {
  return Boolean(profile?.updatedAt)
}
