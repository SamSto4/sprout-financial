"use client"

import { useId, type ReactNode } from "react"
import { cn } from "cn"

/** A titled panel, matching the dashboard's panels. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

const boxClass =
  "flex h-10 items-center rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25"
const inputClass =
  "figures w-full min-w-0 bg-transparent text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"

function FieldShell({ id, label, hint, children }: { id: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function toNumber(raw: string, max: number): number | null {
  if (raw.trim() === "") return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return Math.min(max, Math.max(0, value))
}

/** A number that can be left blank (null), optionally with a $ or % or unit beside it. */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  max = 100_000_000,
  step = 1,
  placeholder,
}: {
  label: ReactNode
  hint?: ReactNode
  value: number | null
  onChange: (value: number | null) => void
  prefix?: string
  suffix?: string
  max?: number
  step?: number
  placeholder?: string
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className={boxClass}>
        {prefix && <span className="pr-1 text-sm text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(event) => onChange(toNumber(event.target.value, max))}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={inputClass}
        />
        {suffix && <span className="pl-1 text-sm whitespace-nowrap text-muted-foreground">{suffix}</span>}
      </div>
    </FieldShell>
  )
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength = 60,
}: {
  label: ReactNode
  hint?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className={boxClass}>
        <input
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(inputClass, "font-normal")}
        />
      </div>
    </FieldShell>
  )
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: ReactNode
  hint?: ReactNode
  value: T
  options: Record<T, string>
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        {(Object.keys(options) as T[]).map((key) => (
          <option key={key} value={key}>
            {options[key]}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

const LEVEL_STYLES = {
  good: "border-primary/25 bg-secondary/60",
  watch: "border-[#B98225]/30 bg-[#B98225]/5",
  act: "border-destructive/30 bg-destructive/5",
} as const

export const LEVEL_LABELS = { good: "Looks good", watch: "Worth a look", act: "Act on this" } as const

/** One finding from a check-up: good, worth a look, or act on this. */
export function CheckItem({ level, title, detail }: { level: keyof typeof LEVEL_STYLES; title: ReactNode; detail: ReactNode }) {
  return (
    <li className={cn("rounded-xl border px-4 py-3", LEVEL_STYLES[level])}>
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
        <span
          className={cn(
            "text-[11px] font-semibold tracking-wide uppercase",
            level === "good" ? "text-primary" : level === "watch" ? "text-[#8a611b]" : "text-[#a33b3b]"
          )}
        >
          {LEVEL_LABELS[level]}
        </span>
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </li>
  )
}
