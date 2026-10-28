"use client"

import {
  ArrowUpRightIcon,
  CreditCardIcon,
  PiggyBankIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "cn"

import { BrandMark } from "@/components/brand-mark"
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
  intro,
  className,
}: {
  suggestions?: Suggestion[]
  onSelect?: (prompt: string) => void
  /**
   * Shown between the heading and the suggestions (the Assistant's topic chips), given the same
   * `onSelect` the suggestions use. Phones then get two suggestions.
   */
  intro?: (ask: (prompt: string) => void) => ReactNode
  className?: string
}) {
  return (
    <Card className={cn("w-full max-w-xl border-0 bg-transparent py-0 ring-0", className)}>
      <CardHeader className="items-center px-0 text-center">
        <BrandMark className="mx-auto mb-3 size-10" />
        <CardTitle className="text-2xl font-semibold sm:text-3xl">How can I help you today?</CardTitle>
        <CardDescription className="text-base">
          Ask about any money topic, or pick a place to start.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        {intro?.((prompt) => onSelect?.(prompt))}
        <div className="space-y-2.5">
          {intro && <h2 className="text-center font-sans text-sm font-semibold">Or try a question</h2>}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.icon ?? WalletIcon
              return (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => onSelect?.(suggestion.prompt)}
                  className={cn(intro && index >= 2 && "max-sm:hidden", "group flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-14px_rgb(24_53_42/0.25)] sm:p-4")}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 font-medium">
                      {suggestion.label}
                      <ArrowUpRightIcon
                        className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                    </span>
                    {suggestion.prompt !== suggestion.label && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">{suggestion.prompt}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
