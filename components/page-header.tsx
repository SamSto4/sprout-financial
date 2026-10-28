import type { ReactNode } from "react"
import { cn } from "cn"

import { GrowthLine } from "@/components/growth-line"

// Shared heading block for top-level pages: eyebrow label with the growth-line accent, serif
// display title, short description, and optional actions that sit beside it on wide screens.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-2xl space-y-3">
        {eyebrow && (
          <p className="eyebrow flex items-center gap-2.5">
            <GrowthLine leaf={false} className="h-3 w-7 shrink-0" />
            {eyebrow}
          </p>
        )}
        <h1 className="display text-4xl sm:text-5xl">{title}</h1>
        {description && <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
