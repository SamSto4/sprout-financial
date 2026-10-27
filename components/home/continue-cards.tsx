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
          <div key={index} className="h-44 animate-pulse rounded-xl border bg-card" aria-hidden="true" />
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
            <Link
              href={card.href}
              className="group flex h-full flex-col rounded-xl border bg-card p-5 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-12px_rgb(24_53_42/0.18)]"
            >
              <span className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {card.label}
              </span>
              <span className="mt-3 line-clamp-2 font-heading text-lg font-semibold">{card.title}</span>
              <span className="mt-1.5 line-clamp-3 flex-1 text-sm text-muted-foreground">{card.detail}</span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                {card.cta}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
