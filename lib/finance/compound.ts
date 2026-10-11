// Compound growth with monthly compounding and monthly contributions.
// Pure and deterministic so the numbers shown in the UI can be unit-tested.

export type GrowthInputs = {
  /** Starting balance. */
  principal: number
  /** Added at the end of every month. */
  monthlyContribution: number
  /** Assumed yearly return as a percentage, e.g. 6 for 6%. */
  annualRatePercent: number
  years: number
}

export type GrowthPoint = {
  year: number
  /** Everything put in so far: starting balance plus contributions. */
  contributed: number
  /** Balance minus what was put in. */
  growth: number
  balance: number
}

export const GROWTH_LIMITS = {
  principal: { min: 0, max: 1_000_000 },
  monthlyContribution: { min: 0, max: 20_000 },
  annualRatePercent: { min: 0, max: 15 },
  years: { min: 1, max: 50 },
} as const

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Keeps inputs inside sensible ranges so bad values can't produce misleading charts. */
export function normalizeGrowthInputs(inputs: GrowthInputs): GrowthInputs {
  return {
    principal: clamp(inputs.principal, GROWTH_LIMITS.principal.min, GROWTH_LIMITS.principal.max),
    monthlyContribution: clamp(
      inputs.monthlyContribution,
      GROWTH_LIMITS.monthlyContribution.min,
      GROWTH_LIMITS.monthlyContribution.max
    ),
    annualRatePercent: clamp(
      inputs.annualRatePercent,
      GROWTH_LIMITS.annualRatePercent.min,
      GROWTH_LIMITS.annualRatePercent.max
    ),
    years: Math.round(clamp(inputs.years, GROWTH_LIMITS.years.min, GROWTH_LIMITS.years.max)),
  }
}

/** Year-by-year balance, starting at year 0. */
export function projectGrowth(raw: GrowthInputs): GrowthPoint[] {
  const { principal, monthlyContribution, annualRatePercent, years } = normalizeGrowthInputs(raw)
  const monthlyRate = annualRatePercent / 100 / 12

  const points: GrowthPoint[] = [{ year: 0, contributed: principal, growth: 0, balance: principal }]
  let balance = principal
  let contributed = principal

  for (let year = 1; year <= years; year++) {
    for (let month = 0; month < 12; month++) {
      balance = balance * (1 + monthlyRate) + monthlyContribution
      contributed += monthlyContribution
    }
    points.push({
      year,
      contributed: roundCents(contributed),
      growth: roundCents(balance - contributed),
      balance: roundCents(balance),
    })
  }

  return points
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100
}
