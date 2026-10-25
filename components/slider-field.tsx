"use client"

import { useId } from "react"

// A labelled range slider paired with a number box, so values can be dragged or typed.
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  prefix?: string
  suffix?: string
  hint?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const fill = ((value - min) / (max - min)) * 100

  function commit(raw: string) {
    const parsed = Number(raw)
    if (raw === "" || !Number.isFinite(parsed)) return
    onChange(Math.min(max, Math.max(min, parsed)))
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex h-9 items-center rounded-md border bg-background px-2.5 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25">
          {prefix && <span className="text-muted-foreground">{prefix}</span>}
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} value`}
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(event) => commit(event.target.value)}
            className="figures h-full w-20 bg-transparent text-right font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {suffix && <span className="pl-0.5 text-muted-foreground">{suffix}</span>}
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        className="range-input w-full"
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
