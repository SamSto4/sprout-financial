"use client"

import { useId } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "cn"

import { buildAboutCard, type CourseLesson } from "@/lib/plan/about-card"
import type { InvestorProfile } from "@/lib/plan/profile"

/**
 * "See exactly what the assistant gets": the About the user summary, built by the same function the
 * server runs on each question (lib/plan/about-card.ts) from the same inputs the page sends, so it
 * shows exactly what's sent, byte for byte.
 */
export function BriefPreview({
  profile,
  completedLessons,
  lessons,
  on,
  open,
  onOpenChange,
}: {
  profile: InvestorProfile | null
  /** The lessons sent (none when "Don't use these" is chosen). */
  completedLessons: readonly string[]
  lessons: readonly CourseLesson[]
  /** Whether About you is on, so this is what's sent now rather than what would be. */
  on: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const id = useId()
  const card = buildAboutCard({ profile, completedLessons, lessons })
  return (
    <div className="rounded-xl border bg-background">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-primary outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        See exactly what the assistant gets
        <ChevronDownIcon className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="space-y-2 border-t px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            {on
              ? "Added to the assistant's instructions with each question, written by Sprout's code:"
              : "About you is off on this device, so none of this is sent. With it on, each question would carry:"}
          </p>
          {card.text ? (
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
              {card.text}
            </pre>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nothing yet. Pick a topic in an empty chat or fill in My plan.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Exact amounts stay out of it. The assistant looks them up in your plan only when an answer needs them.
          </p>
        </div>
      )}
    </div>
  )
}
