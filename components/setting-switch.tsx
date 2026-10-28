import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * A labelled on/off setting drawn as a switch. It's a real checkbox underneath (visually hidden),
 * so the label, keyboard and screen readers work as they did; only the picture changes.
 */
export function SettingSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-(--duration-fast) hover:bg-muted",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="min-w-0 flex-1 text-xs leading-relaxed">
        <span className="block text-[13px] leading-snug font-medium text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-muted-foreground">{description}</span>}
      </span>
      {/* The track's off color keeps 3:1 against white, so "off" is visible, not just faint. */}
      <span
        aria-hidden="true"
        className="relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-[color-mix(in_oklch,var(--muted-foreground),white_20%)] transition-[background-color,box-shadow] duration-(--duration-fast) peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
      >
        <span className="size-4 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform duration-(--duration-fast) ease-out group-has-checked:translate-x-[18px]" />
      </span>
    </label>
  )
}
