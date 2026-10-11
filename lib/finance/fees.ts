// How a yearly fee shrinks an investment over time. The fee is taken straight off the
// yearly return, a close approximation of how fund expense ratios work.

import { projectGrowth, type GrowthInputs } from "./compound.ts"

export type FeeInputs = GrowthInputs & {
  /** Yearly fee as a percentage, e.g. 0.5 for 0.5%. */
  feePercent: number
}

export const FEE_LIMITS = { min: 0, max: 3 } as const

function finalBalance(inputs: GrowthInputs) {
  const points = projectGrowth(inputs)
  return points[points.length - 1]
}

/** Ending balance after fees, and how much less that is than with no fee at all. */
export function projectWithFee(inputs: FeeInputs) {
  const fee = Math.min(FEE_LIMITS.max, Math.max(FEE_LIMITS.min, Number.isFinite(inputs.feePercent) ? inputs.feePercent : 0))
  const withoutFee = finalBalance(inputs)
  const withFee = finalBalance({ ...inputs, annualRatePercent: Math.max(0, inputs.annualRatePercent - fee) })
  return {
    balance: withFee.balance,
    contributed: withFee.contributed,
    lostToFees: Math.round((withoutFee.balance - withFee.balance) * 100) / 100,
  }
}
