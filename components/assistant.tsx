"use client"

import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import {
  ChartPieIcon,
  CompassIcon,
  FileSpreadsheetIcon,
  HandCoinsIcon,
  SearchCheckIcon,
  TrendingDownIcon,
  HistoryIcon,
  PanelLeftIcon,
  PlusIcon,
  RepeatIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TrendingUpIcon,
} from "lucide-react"
import { useSession } from "next-auth/react"
import { cn } from "cn"

import { useAccountsEnabled } from "@/components/accounts-context"
import { Chat, type SharedItem } from "@/components/chat"
import type { Suggestion } from "@/components/chat-suggestions"
import { FinanceImport } from "@/components/finance-import"
import { PlanSidebarPanel } from "@/components/plan/plan-sidebar-panel"
import { Button } from "@/components/ui/button"
import { chatTitle, newChatId, toPastChats, upsertChat, type SavedChat } from "@/lib/chat/history"
import { followOpenChat, maySaveChat, type ChatBasis, type OpenChat } from "@/lib/chat/open-chat"
import type { ChatContext, ChatMessage } from "@/lib/chat/validate"
import type { ImportedFinances } from "@/lib/finance/transactions"
import { storageWorks } from "@/lib/local-store"
import {
  chatsStore,
  clearFinances,
  copyClearedStore,
  financesStore,
  memoryStore,
  portfolioStore,
  profileStore,
  saveChats,
  shareFinancesStore,
  sharePlanStore,
} from "@/lib/stores"
import { nextStamp } from "@/lib/sync/stamp"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

const TIPS_PROMPT =
  "Look at my imported transactions and give me tips on how I could start investing. Ask me anything you need to know first."

const FINANCE_SUGGESTIONS: Suggestion[] = [
  { label: "Investing tips", prompt: "Based on my imported transactions, how could I start investing?", icon: TrendingUpIcon },
  { label: "Where my money goes", prompt: "Where does most of my money go, based on my imported transactions?", icon: ChartPieIcon },
  { label: "Regular charges", prompt: "Which bills and subscriptions show up every month, and which could I cut back?", icon: RepeatIcon },
  { label: "Emergency fund", prompt: "Based on my spending, how big should my emergency fund be?", icon: ShieldCheckIcon },
]

const PLAN_SUGGESTIONS: Suggestion[] = [
  { label: "What's my next step?", prompt: "Look at my plan. What's the most important thing for me to do next?", icon: CompassIcon },
  { label: "Next $200", prompt: "I have an extra $200 this month. Where should it go, based on my plan?", icon: HandCoinsIcon },
  { label: "Check my portfolio", prompt: "Give my portfolio a check-up. Is anything out of line with my plan?", icon: SearchCheckIcon },
  { label: "If markets crash", prompt: "What would a big stock market crash do to my portfolio, and what should I do if it happens?", icon: TrendingDownIcon },
]

const EMPTY: ChatMessage[] = []
const NO_HOLDINGS: never[] = []

const noop = () => () => {}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

function chatDate(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round(
    (new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000
  )
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return dayFormat.format(date)
}

export function Assistant({
  initialPrompt = "",
  initialChatId = null,
  allowDeepResearch = true,
}: {
  initialPrompt?: string
  /** A saved chat to open (/assistant?chat=<id>). If this browser has no chat with that id, a new chat starts. */
  initialChatId?: string | null
  /** False when web search is switched off on the server, which hides the Deep research switch. */
  allowDeepResearch?: boolean
}) {
  const chats = useStoredValue(chatsStore)
  const finances = useStoredValue(financesStore)
  const shareFinances = useStoredValue(shareFinancesStore)
  // Transactions only go to the assistant when the user has chosen to share them.
  const sharedFinances = shareFinances ? finances : null
  const memoryOn = useStoredValue(memoryStore)
  const profile = useStoredValue(profileStore)
  const portfolio = useStoredValue(portfolioStore)
  const sharePlan = useStoredValue(sharePlanStore)
  const hasPlan = Boolean(profile?.updatedAt) || (portfolio?.holdings.length ?? 0) > 0
  const planShared = sharePlan && hasPlan
  const loaded = useHydrated()
  const storageBlocked = useSyncExternalStore(noop, () => !storageWorks(), () => false)
  // `focus`: put the cursor in the message box (a new chat, or a question passed in with ?q=).
  const [session, setSession] = useState(() => ({ id: newChatId(), prompt: initialPrompt, focus: initialPrompt !== "" }))
  const [panelOpen, setPanelOpen] = useState(false)
  // Saved chats are only readable once the browser has taken over, so the chat a link names is
  // opened then, during that render, instead of flashing past an empty chat in an effect.
  const [chatToOpen, setChatToOpen] = useState(initialChatId)
  if (loaded && chatToOpen !== null) {
    setChatToOpen(null)
    if (chats.some((chat) => chat.id === chatToOpen)) setSession((current) => ({ ...current, id: chatToOpen, focus: false }))
  }

  const activeChat = chats.find((chat) => chat.id === session.id)
  // The conversation on screen lives in the Chat's memory and is saved after every reply. When this
  // browser's copy is cleared (sign-out, account deletion, the session ended on another device) or
  // the open saved chat is deleted in another tab, a new chat starts instead, so the old
  // conversation leaves the screen and isn't saved back (lib/chat/open-chat.ts).
  const cleared = useStoredValue(copyClearedStore)
  const basis: ChatBasis = { cleared, saved: activeChat !== undefined }
  const [seen, setSeen] = useState<OpenChat | null>(null)
  if (loaded && chatToOpen === null) {
    const next = followOpenChat(seen, { id: session.id, ...basis })
    if (next.reset) setSession({ id: newChatId(), prompt: "", focus: false })
    else if (next.seen !== seen) setSeen(next.seen)
  }

  // `then`: what the conversation was based on when the question was sent. A reply that finishes
  // after a clear, or after its saved chat was deleted, isn't saved.
  const saveChat = useCallback((id: string, messages: ChatMessage[], then: ChatBasis) => {
    const kept = messages.filter((message) => message.content.trim())
    if (!kept.some((message) => message.role === "user")) return
    const current = chatsStore.get()
    const existing = current.find((chat) => chat.id === id)
    if (!maySaveChat(then, { cleared: copyClearedStore.get(), saved: existing !== undefined })) return
    const now = new Date()
    saveChats(
      upsertChat(current, {
        id,
        title: existing?.title ?? chatTitle(kept),
        createdAt: existing?.createdAt ?? now.toISOString(),
        // Later than the copy it continues, even one saved by a device whose clock runs ahead.
        updatedAt: nextStamp(existing?.updatedAt, now),
        messages: kept,
      })
    )
  }, [])

  function startChat(prompt = "") {
    setSession({ id: newChatId(), prompt, focus: true })
    setPanelOpen(false)
  }

  function openChat(id: string) {
    setSession({ id, prompt: "", focus: false })
    setPanelOpen(false)
  }

  function deleteChat(id: string) {
    saveChats(chatsStore.get().filter((chat) => chat.id !== id))
    if (id === session.id) startChat()
  }

  function toggleMemory(on: boolean) {
    memoryStore.set(on)
  }

  function importFinances(next: ImportedFinances) {
    financesStore.set(next)
    // Importing here, next to the chat, is an explicit choice to use it in chats.
    shareFinancesStore.set(true)
  }

  function removeFinances() {
    clearFinances()
  }

  const pastChats = useMemo(() => (memoryOn ? toPastChats(chats, session.id) : []), [chats, memoryOn, session.id])
  const context: ChatContext = useMemo(
    () => ({
      pastChats,
      transactions: sharedFinances?.transactions ?? [],
      profile: planShared ? profile : null,
      holdings: planShared ? (portfolio?.holdings ?? NO_HOLDINGS) : NO_HOLDINGS,
    }),
    [pastChats, sharedFinances, planShared, profile, portfolio]
  )
  // Named in the message box, so it's clear what goes with each question on every screen size.
  const shared = useMemo<SharedItem[]>(
    () => [
      ...(pastChats.length > 0
        ? [{ label: `${pastChats.length} past ${pastChats.length === 1 ? "chat" : "chats"}`, icon: HistoryIcon }]
        : []),
      ...(planShared ? [{ label: "Your plan", icon: CompassIcon }] : []),
      ...(sharedFinances ? [{ label: "Your transactions", icon: FileSpreadsheetIcon }] : []),
    ],
    [pastChats.length, planShared, sharedFinances]
  )

  const sidebar = (
    <Sidebar
      chats={chats}
      activeId={session.id}
      loaded={loaded}
      storageBlocked={storageBlocked}
      memoryOn={memoryOn}
      finances={finances}
      onOpen={openChat}
      onDelete={deleteChat}
      onToggleMemory={toggleMemory}
      onImport={importFinances}
      onRemoveFinances={removeFinances}
      shareFinances={shareFinances}
      onToggleShare={(on) => shareFinancesStore.set(on)}
      onAskForTips={() => {
        shareFinancesStore.set(true)
        startChat(TIPS_PROMPT)
      }}
    />
  )

  return (
    <div className="flex h-full min-h-0 w-full max-w-6xl gap-6">
      <aside aria-label="Saved chats and finances" className="hidden w-72 shrink-0 overflow-y-auto pr-1 lg:block">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 pb-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            aria-controls="assistant-panel"
          >
            <PanelLeftIcon />
            {panelOpen ? "Back to chat" : "Chats & finances"}
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium max-lg:sr-only">{activeChat?.title}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => startChat()}>
              <PlusIcon />
              New chat
            </Button>
          </div>
        </div>

        {panelOpen && (
          <div id="assistant-panel" className="min-h-0 flex-1 overflow-y-auto lg:hidden">
            {sidebar}
          </div>
        )}

        {/* Hidden rather than unmounted while the panel is open, so a reply keeps streaming. */}
        <div className={cn("min-h-0 flex-1", panelOpen ? "hidden lg:flex" : "flex")}>
          <Chat
            key={session.id}
            initialMessages={activeChat?.messages ?? EMPTY}
            initialPrompt={session.prompt}
            context={context}
            suggestions={planShared ? PLAN_SUGGESTIONS : sharedFinances ? FINANCE_SUGGESTIONS : undefined}
            allowDeepResearch={allowDeepResearch}
            shared={shared}
            focusOnMount={session.focus}
            onManageSharing={() => setPanelOpen(true)}
            onNewChat={() => startChat()}
            onSettled={(messages) => saveChat(session.id, messages, basis)}
          />
        </div>
      </div>
    </div>
  )
}

function Sidebar({
  chats,
  activeId,
  loaded,
  storageBlocked,
  memoryOn,
  finances,
  onOpen,
  onDelete,
  onToggleMemory,
  onImport,
  onRemoveFinances,
  shareFinances,
  onToggleShare,
  onAskForTips,
}: {
  chats: SavedChat[]
  activeId: string
  loaded: boolean
  storageBlocked: boolean
  memoryOn: boolean
  finances: ImportedFinances | null
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onToggleMemory: (on: boolean) => void
  onImport: (finances: ImportedFinances) => void
  onRemoveFinances: () => void
  shareFinances: boolean
  onToggleShare: (on: boolean) => void
  onAskForTips: () => void
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const signedIn = useSession().status === "authenticated"
  const accounts = useAccountsEnabled()

  return (
    <div className="space-y-7 pb-4">
      <section aria-labelledby="saved-chats-title" className="space-y-2">
        <h2 id="saved-chats-title" className="flex items-center gap-2 font-sans text-sm font-semibold">
          <HistoryIcon className="size-4 text-primary" aria-hidden="true" />
          Your chats
        </h2>
        {loaded && chats.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Conversations are saved here after the first answer.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((chat) => {
              const active = chat.id === activeId
              if (confirmingId === chat.id) {
                return (
                  <li key={chat.id} className="rounded-lg bg-destructive/5 px-2.5 py-2 text-xs">
                    <p className="font-medium">Delete “{chat.title}”?</p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        onClick={() => {
                          onDelete(chat.id)
                          setConfirmingId(null)
                        }}
                      >
                        Delete
                      </Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmingId(null)}>
                        Keep
                      </Button>
                    </div>
                  </li>
                )
              }
              return (
                <li key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpen(chat.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col rounded-lg px-2.5 py-2 pr-9 text-left transition-colors hover:bg-background",
                      active && "bg-background shadow-[0_1px_2px_rgb(24_53_42/0.06)] ring-1 ring-border"
                    )}
                  >
                    <span className="truncate text-sm">{chat.title}</span>
                    <span className="text-[11px] text-muted-foreground">{chatDate(chat.updatedAt)}</span>
                  </button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete “${chat.title}”`}
                    onClick={() => setConfirmingId(chat.id)}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-background">
          <input
            type="checkbox"
            checked={memoryOn}
            onChange={(event) => onToggleMemory(event.target.checked)}
            className="mt-0.5 size-3.5 accent-primary"
          />
          <span>
            <span className="block font-medium">Let the assistant use past chats</span>
            <span className="text-muted-foreground">It can look back at your 20 most recent chats to remember your goals and details.</span>
          </span>
        </label>
      </section>

      <PlanSidebarPanel />

      <div className="space-y-2">
        <FinanceImport
          finances={finances}
          onImport={onImport}
          onRemove={onRemoveFinances}
          onAskForTips={onAskForTips}
        />
        {finances && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-background">
            <input
              type="checkbox"
              checked={shareFinances}
              onChange={(event) => onToggleShare(event.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              <span className="block font-medium">Let the assistant see my transactions</span>
              <span className="text-muted-foreground">
                {shareFinances
                  ? "They're sent with each question so answers can use your real numbers."
                  : "Off: questions are answered without your transactions."}
              </span>
            </span>
          </label>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {storageBlocked
          ? "This browser is blocking storage, so chats and imports will be lost when you leave the page."
          : signedIn
            ? "Chats and imports are saved to your account and sync across your devices."
            : accounts
              ? "Chats and imports are saved in this browser only. Log in to keep them in your account and use them on other devices."
              : "Chats and imports are saved in this browser only."}
      </p>
    </div>
  )
}
