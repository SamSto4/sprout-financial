import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * The heading block that opens a section on the home and About pages: an eyebrow, a large serif
 * display heading and an optional lead paragraph. One size for every section, so the pages share
 * one rhythm.
 */
export function SectionIntro({
  eyebrow,
  title,
  titleId,
  className,
  children,
}: {
  eyebrow: string
  title: ReactNode
  titleId: string
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={titleId} className="display mt-3 text-[2rem] sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {children && <p className="mt-4 text-base text-pretty text-muted-foreground sm:text-lg">{children}</p>}
    </div>
  )
}

/** Vertical space for a page section: tighter on phones, generous on large screens. */
export const SECTION_SPACE = "px-4 py-16 sm:px-6 sm:py-20 lg:py-28"

/** A text link with an arrow that nudges forward on hover, for "see more" links under a section. */
export const ARROW_LINK =
  "group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
