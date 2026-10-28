"use client"

import {
  BookOpenIcon,
  CalculatorIcon,
  CheckIcon,
  CreditCardIcon,
  HomeIcon,
  PiggyBankIcon,
  SunriseIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"

import { FOCUS, FOCUS_IDS, type FocusId } from "@/lib/plan/focus"

export const FOCUS_ICONS: Record<FocusId, LucideIcon> = {
  debt: CreditCardIcon,
  saving: PiggyBankIcon,
  investing: TrendingUpIcon,
  retirement: SunriseIcon,
  home: HomeIcon,
  budget: CalculatorIcon,
  learning: BookOpenIcon,
}

/**
 * "Start with what you're working on": the empty chat's topic chips. One tap saves the topic to
 * About you and asks its starter question (the Assistant does both). Topics already saved show a
 * check, so a tap is never a surprise; nothing is chosen for the person.
 */
export function FocusChips({ saved, onPick }: { saved: readonly FocusId[]; onPick: (id: FocusId) => void }) {
  return (
    <section aria-labelledby="focus-chips-title" className="space-y-2.5">
      <h2 id="focus-chips-title" className="text-center font-sans text-sm font-semibold">
        Start with what you&apos;re working on
      </h2>
      <ul className="flex flex-wrap justify-center gap-2">
        {FOCUS_IDS.map((id) => {
          const Icon = saved.includes(id) ? CheckIcon : FOCUS_ICONS[id]
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onPick(id)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-[border-color,background-color] outline-none hover:border-brand/50 hover:bg-secondary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {FOCUS[id].chip}
                {saved.includes(id) && <span className="sr-only">(saved)</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mx-auto max-w-md text-center text-xs text-muted-foreground">
        A tap saves the topic to About you so answers fit, and asks a first question. You can undo it or change it anytime.
      </p>
    </section>
  )
}
