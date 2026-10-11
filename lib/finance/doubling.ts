// How long money takes to double at a steady yearly return.

/** The Rule of 72 shortcut: 72 divided by the yearly return in percent. */
export function ruleOf72Years(annualRatePercent: number) {
  return annualRatePercent > 0 ? 72 / annualRatePercent : Infinity
}

/** The exact answer with yearly compounding: ln(2) / ln(1 + r). */
export function exactDoublingYears(annualRatePercent: number) {
  return annualRatePercent > 0 ? Math.log(2) / Math.log(1 + annualRatePercent / 100) : Infinity
}
