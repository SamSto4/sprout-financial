"use client"

import { useState } from "react"
import {
  ArrowUpRightIcon,
  CreditCardIcon,
  PiggyBankIcon,
  TrendingUpIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
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
  className,
}: {
  suggestions?: Suggestion[]
  onSelect?: (prompt: string) => void
  className?: string
}) {
  const [selected, setSelected] = useState<Suggestion | null>(null)

  function handleSelect(suggestion: Suggestion) {
    setSelected(suggestion)
    onSelect?.(suggestion.prompt)
  }

  return (
    <Card className={cn("w-full max-w-xl border-0 bg-transparent py-0 ring-0", className)}>
      <CardHeader className="items-center px-0 text-center">
        <BrandMark className="mx-auto mb-3 size-10" />
        <CardTitle className="text-2xl font-semibold sm:text-3xl">How can I help you today?</CardTitle>
        <CardDescription className="text-base">
          Ask about any money topic, or pick a place to start.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {suggestions.map((suggestion) => {
            const Icon = suggestion.icon ?? WalletIcon
            const isSelected = selected?.label === suggestion.label
            return (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => handleSelect(suggestion)}
                aria-pressed={isSelected}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[0_8px_24px_-14px_rgb(24_53_42/0.25)]",
                  isSelected && "border-brand bg-surface"
                )}
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
                  <span className="mt-0.5 block text-sm text-muted-foreground">{suggestion.prompt}</span>
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
