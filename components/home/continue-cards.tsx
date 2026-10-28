"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowRightIcon, BookOpenIcon, CompassIcon, MessageSquareTextIcon, WalletIcon, type LucideIcon } from "lucide-react"

import { continueCards, type ContinueCard, type LessonRef } from "@/lib/home/continue"
import { chatsStore, financesStore, profileStore, progressStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

const ICONS: Record<ContinueCard["id"], LucideIcon> = {
  course: BookOpenIcon,
  plan: CompassIcon,
  assistant: MessageSquareTextIcon,
  dashboard: WalletIcon,
}

/** Where to pick up, read from this browser's saved data (which sync keeps in step with the account). */
export function ContinueCards({ lessons }: { lessons: LessonRef[] }) {
  const hydrated = useHydrated()
  const progress = useStoredValue(progressStore)
  const profile = useStoredValue(profileStore)
  const chats = useStoredValue(chatsStore)
  const finances = useStoredValue(financesStore)
  const cards = useMemo(
    () => continueCards({ progress, profile, chats, finances }, lessons),
    [progress, profile, chats, finances, lessons]
  )

  // Browser storage isn't readable on the server, so show placeholders until it is, rather than
  // flashing "Start the course" at someone halfway through it.
  if (!hydrated) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <span className="sr-only">Loading your progress…</span>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-52 animate-pulse rounded-2xl border bg-card shadow-xs" aria-hidden="true" />
        ))}
      </div>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = ICONS[card.id]
        return (
          <li key={card.id}>
            <Link href={card.href} className="group lift flex h-full flex-col rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
              <span className="flex items-center gap-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {card.label}
              </span>
              <span className="display mt-4 line-clamp-2 text-xl sm:text-[1.375rem]">{card.title}</span>
              <span className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{card.detail}</span>
              <span className="mt-5 inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-primary">
                {card.cta}
                <ArrowRightIcon
                  className="size-4 transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
