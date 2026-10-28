"use client"

import {
  ArrowUpRightIcon,
  CreditCardIcon,
  PiggyBankIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

import { GrowthLine } from "@/components/growth-line"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type Suggestion = {
  label: string
  prompt: string
  icon?: LucideIcon
}

const defaultSuggestions: Suggestion[] = [
  { label: "Build a budget", prompt: "How do I build a monthly budget?", icon: WalletIcon },
  { label: "Start saving", prompt: "What's the best way to start saving money?", icon: PiggyBankIcon },
  { label: "Explain investing", prompt: "Can you explain how investing works?", icon: TrendingUpIcon },
  { label: "Pay off debt", prompt: "How should I pay off my debt faster?", icon: CreditCardIcon },
]

export function ChatSuggestions({
  suggestions = defaultSuggestions,
  onSelect,
  className,
}: {
  suggestions?: Suggestion[]
  onSelect?: (prompt: string) => void
  className?: string
}) {
  return (
    <Card className={cn("w-full max-w-xl border-0 bg-transparent py-0 shadow-none ring-0", className)}>
      <CardHeader className="items-center gap-0 px-0 text-center">
        {/* Sprout's growth curve, drawn once and left still: this screen opens with every new chat. */}
        <GrowthLine className="mx-auto mb-3 h-7 w-24 sm:mb-5 sm:h-11 sm:w-36" />
        <p className="eyebrow mb-1.5 sm:mb-2">Your money coach</p>
        <CardTitle className="display text-[1.75rem] sm:text-4xl">How can I help you today?</CardTitle>
        <CardDescription className="mx-auto mt-1.5 text-sm leading-relaxed sm:mt-2 sm:text-base">
          Ask about any money topic, or pick a place to start.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-5 px-0 sm:mt-8">
        <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon ?? WalletIcon
            return (
              <li key={suggestion.label} className="flex">
                <button
                  type="button"
                  onClick={() => onSelect?.(suggestion.prompt)}
                  className="lift group flex w-full items-start gap-3 rounded-xl border bg-background px-3 py-2.5 text-left shadow-xs sm:p-4"
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary sm:mt-0 sm:size-9">
                    <Icon className="size-4 sm:size-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-[15px] leading-snug font-medium">
                      {suggestion.label}
                      <ArrowUpRightIcon
                        className="size-4 shrink-0 text-primary opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground sm:text-sm">
                      {suggestion.prompt}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
