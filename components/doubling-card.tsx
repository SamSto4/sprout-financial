"use client"

import { useState } from "react"
import { cn } from "cn"

import { exactDoublingYears, ruleOf72Years } from "@/lib/finance/doubling"

const RATES = [2, 4, 6, 8, 10]

// Interactive "Rule of 72" explainer: pick a yearly return, see how long money takes to double.
export function DoublingCard() {
  const [rate, setRate] = useState(6)
  const shortcut = ruleOf72Years(rate)
  const exact = exactDoublingYears(rate)
  // Bars show one doubling period on a 40-year scale.
  const width = Math.min(100, (shortcut / 40) * 100)

  return (
    <section
      aria-labelledby="rule72-title"
      className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04),0_12px_32px_-16px_rgb(24_53_42/0.18)] sm:p-6"
    >
      <p className="eyebrow">Quick lesson</p>
      <h2 id="rule72-title" className="mt-1 text-xl font-semibold">
        The Rule of 72
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Divide 72 by a yearly return to estimate how many years it takes money to double.
      </p>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-muted-foreground">Pick a yearly return</legend>
        <div className="mt-2 grid grid-cols-5 gap-1.5 rounded-lg bg-muted p-1">
          {RATES.map((value) => (
            <label
              key={value}
              className={cn(
                "figures cursor-pointer rounded-md py-1.5 text-center text-sm font-medium transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                value === rate
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <input
                type="radio"
                name="rule72-rate"
                value={value}
                checked={value === rate}
                onChange={() => setRate(value)}
                className="sr-only"
              />
              {value}%
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 space-y-3" aria-live="polite">
        <p className="flex items-baseline gap-2">
          <span className="figures font-heading text-4xl font-semibold text-primary">
            {shortcut.toFixed(shortcut % 1 === 0 ? 0 : 1)}
          </span>
          <span className="text-sm text-muted-foreground">years to double at {rate}%</span>
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${width}%` }}
          />
        </div>
        <p className="figures text-xs text-muted-foreground">
          72 ÷ {rate} = {shortcut.toFixed(1)}. The exact figure with yearly compounding is{" "}
          {exact.toFixed(1)} years, so the shortcut is close.
        </p>
      </div>
    </section>
  )
}
