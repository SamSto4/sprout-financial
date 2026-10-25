"use client"

import { useMemo } from "react"
import { ChartPieIcon, PiggyBankIcon, RepeatIcon, TrendingUpIcon } from "lucide-react"

import { Chat } from "@/components/chat"
import type { Suggestion } from "@/components/chat-suggestions"
import type { ChatContext } from "@/lib/chat/validate"
import type { Transaction } from "@/lib/finance/transactions"

const SUGGESTIONS: Suggestion[] = [
  { label: "What changed?", prompt: "How has my spending changed from month to month, and why?", icon: TrendingUpIcon },
  { label: "Cut $200 a month", prompt: "Where could I realistically cut $200 a month based on my spending?", icon: PiggyBankIcon },
  { label: "Review my bills", prompt: "Which of my regular bills and subscriptions are worth reviewing?", icon: RepeatIcon },
  { label: "Start investing", prompt: "Based on what's left over each month, how could I start investing?", icon: ChartPieIcon },
]

// The assistant, embedded on the dashboard with the imported transactions as its only context.
// Conversations here aren't saved; the Assistant page keeps a history.
export function FinanceChat({
  transactions,
  draft,
}: {
  transactions: Transaction[]
  draft?: { id: number; text: string }
}) {
  const context: ChatContext = useMemo(() => ({ pastChats: [], transactions, profile: null, holdings: [] }), [transactions])

  return (
    <div className="h-[min(600px,75svh)]">
      <Chat context={context} suggestions={SUGGESTIONS} draft={draft} />
    </div>
  )
}
