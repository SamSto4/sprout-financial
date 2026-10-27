"use client"

import { useMemo, useState } from "react"
import { ChartPieIcon, FileSpreadsheetIcon, PiggyBankIcon, RepeatIcon, TrendingUpIcon } from "lucide-react"

import { Chat, type SharedItem } from "@/components/chat"
import type { Suggestion } from "@/components/chat-suggestions"
import type { ChatContext } from "@/lib/chat/validate"
import type { Transaction } from "@/lib/finance/transactions"

const SUGGESTIONS: Suggestion[] = [
  { label: "What changed?", prompt: "How has my spending changed from month to month, and why?", icon: TrendingUpIcon },
  { label: "Cut $200 a month", prompt: "Where could I realistically cut $200 a month based on my spending?", icon: PiggyBankIcon },
  { label: "Review my bills", prompt: "Which of my regular bills and subscriptions are worth reviewing?", icon: RepeatIcon },
  { label: "Start investing", prompt: "Based on what's left over each month, how could I start investing?", icon: ChartPieIcon },
]

const SHARED: SharedItem[] = [{ label: "Your transactions", icon: FileSpreadsheetIcon }]

// The assistant, embedded on the dashboard with the imported transactions as its only context.
// Conversations here aren't saved; the Assistant page keeps a history. Deep research is left
// out: these questions are about the user's own numbers, not the web.
export function FinanceChat({
  transactions,
  draft,
}: {
  transactions: Transaction[]
  draft?: { id: number; text: string }
}) {
  const context: ChatContext = useMemo(() => ({ pastChats: [], transactions, profile: null, holdings: [] }), [transactions])
  // A new key starts a fresh conversation when this one reaches its length limit.
  const [chatKey, setChatKey] = useState(0)

  return (
    <div className="h-[min(600px,75svh)]">
      <Chat
        key={chatKey}
        context={context}
        suggestions={SUGGESTIONS}
        draft={draft}
        allowDeepResearch={false}
        shared={SHARED}
        // A fresh chat from "Start a new chat" puts the cursor back in the box.
        focusOnMount={chatKey > 0}
        onNewChat={() => setChatKey((key) => key + 1)}
      />
    </div>
  )
}
