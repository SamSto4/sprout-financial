"use client"

import { useCallback, useMemo, useState, useSyncExternalStore } from "react"
import {
  BriefcaseIcon,
  ChartPieIcon,
  CheckIcon,
  CompassIcon,
  FileSpreadsheetIcon,
  HandCoinsIcon,
  MapPinIcon,
  SearchCheckIcon,
  TrendingDownIcon,
  HistoryIcon,
  PanelLeftIcon,
  PlusIcon,
  RepeatIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TrendingUpIcon,
  UserRoundIcon,
} from "lucide-react"
import { useSession } from "next-auth/react"
import { cn } from "cn"

import { useAccountsEnabled } from "@/components/accounts-context"
import { FOCUS_ICONS, FocusChips } from "@/components/about-you/focus-chips"
import { Chat, type Settled, type SharedItem } from "@/components/chat"
import type { Suggestion } from "@/components/chat-suggestions"
import { FinanceImport } from "@/components/finance-import"
import { AboutYouPanel } from "@/components/plan/plan-sidebar-panel"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { chatTitle, newChatId, toPastChats, upsertChat, type SavedChat } from "@/lib/chat/history"
import { followOpenChat, maySaveChat, type ChatBasis, type OpenChat } from "@/lib/chat/open-chat"
import type { ChatContext, ChatMessage } from "@/lib/chat/validate"
import type { ImportedFinances } from "@/lib/finance/transactions"
import { formatMoney } from "@/lib/format"
import { storageWorks } from "@/lib/local-store"
import type { CourseLesson } from "@/lib/plan/about-card"
import { fixedAmountsFit, type CountryCode } from "@/lib/plan/countries"
import { addFocus, FOCUS, FOCUS_IDS, starterQuestions, stepStarter, type FocusId } from "@/lib/plan/focus"
import { hasPlanDetails, hasProfile, profileCurrency, type InvestorProfile } from "@/lib/plan/profile"
import { countryInSentence, countryOffer, undoSave, type SavedFields } from "@/lib/plan/remember"
import { buildRoadmap } from "@/lib/plan/roadmap"
import {
  chatsStore,
  clearFinances,
  copyClearedStore,
  financesStore,
  memoryStore,
  portfolioStore,
  profileStore,
  progressStore,
  resetPlanSharing,
  saveChats,
  saveProfile,
  shareFinancesStore,
  shareLessonsStore,
  sharePlanChoiceStore,
  sharePlanStore,
  sharePortfolioStore,
  updateProfile,
} from "@/lib/stores"
import { useMediaQuery } from "@/lib/use-media-query"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

const TIPS_PROMPT =
  "Look at my imported transactions and give me tips on how I could start investing. Ask me anything you need to know first."

const FINANCE_SUGGESTIONS: Suggestion[] = [
  { label: "Investing tips", prompt: "Based on my imported transactions, how could I start investing?", icon: TrendingUpIcon },
  { label: "Where my money goes", prompt: "Where does most of my money go, based on my imported transactions?", icon: ChartPieIcon },
  { label: "Regular charges", prompt: "Which bills and subscriptions show up every month, and which could I cut back?", icon: RepeatIcon },
  { label: "Emergency fund", prompt: "Based on my spending, how big should my emergency fund be?", icon: ShieldCheckIcon },
]

const PORTFOLIO_SUGGESTIONS: Suggestion[] = [
  { label: "Check my portfolio", prompt: "Give my portfolio a check-up. Is anything out of line with my plan?", icon: SearchCheckIcon },
  { label: "If markets crash", prompt: "What would a big stock market crash do to my portfolio, and what should I do if it happens?", icon: TrendingDownIcon },
]

/**
 * The empty chat's suggestions while About you is on: the roadmap step and the "next money" question
 * only when the plan has real content (a topic alone gives no plan suggestions), then questions for
 * each topic picked, then the portfolio's while it's shared. Empty when none apply.
 */
function personalSuggestions(profile: InvestorProfile | null, portfolioShared: boolean): Suggestion[] {
  const suggestions: Suggestion[] = []
  if (profile && hasPlanDetails(profile)) {
    const step = buildRoadmap(profile).current
    if (step) suggestions.push({ label: "Your next step", prompt: stepStarter(step.id), icon: CompassIcon })
    // A fixed $200 only where it's about that much in their currency (not ¥200 or ₹200).
    const currency = profileCurrency(profile) ?? "USD"
    const extra = fixedAmountsFit(currency) ? formatMoney(200, currency) : null
    suggestions.push(
      extra
        ? { label: `Next ${extra}`, prompt: `I have an extra ${extra} this month. Where should it go, based on my plan?`, icon: HandCoinsIcon }
        : { label: "Extra money", prompt: "I have some extra money this month. Where should it go, based on my plan?", icon: HandCoinsIcon }
    )
  }
  for (const question of starterQuestions({ focus: profile?.focus ?? [] })) {
    const id = FOCUS_IDS.find((focus) => (FOCUS[focus].more as readonly string[]).includes(question))
    suggestions.push({ label: question, prompt: question, icon: id ? FOCUS_ICONS[id] : CompassIcon })
  }
  if (portfolioShared) suggestions.push(...PORTFOLIO_SUGGESTIONS)
  return suggestions.slice(0, 4)
}

/** Something just saved from the chat, shown under the reply with Undo. */
type Receipt = {
  chatId: string
  fields: SavedFields
  /** "wants help with paying off debt", "you live in Ireland (amounts in EUR)". */
  text: string
  /** The profile before the save, for Undo. */
  before: InvestorProfile | null
  /** This save turned About you on for this device (it was undecided). */
  turnedOn: boolean
  undone: boolean
}

/** A one-tap offer to remember the country the person just said they live in. */
type Offer = { chatId: string; code: CountryCode; name: string }

const EMPTY: ChatMessage[] = []
const NO_LESSONS: string[] = []

/** Tailwind's lg breakpoint, where the side panel is on screen. */
const WIDE = "(min-width: 64rem)"
/** The same as components/chat.tsx: on touch screens focusing the message box pops up the keyboard. */
const TOUCH = "(pointer: coarse)"

/**
 * After a button that removes itself (Undo, Remember, No thanks, the banner's), put focus somewhere
 * useful instead of letting it drop to the top of the page: the message box, or on touch screens
 * (where that pops up the keyboard) the receipt line when there is one.
 */
function focusAfterTap() {
  requestAnimationFrame(() => {
    const target = window.matchMedia(TOUCH).matches ? document.getElementById("about-you-receipt") : document.getElementById("chat-input")
    target?.focus({ preventScroll: true })
  })
}

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
  lessons = [],
}: {
  /** The course outline (slug and title only), for About you's lesson line and preview. */
  lessons?: readonly CourseLesson[]
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
  const progress = useStoredValue(progressStore)
  // About you: true or false once chosen on this device, null while it hasn't been asked here.
  const aboutChoice = useStoredValue(sharePlanChoiceStore)
  const aboutOn = aboutChoice === true
  const shareLessons = useStoredValue(shareLessonsStore)
  const sharePortfolio = useStoredValue(sharePortfolioStore)
  const holdings = portfolio?.holdings ?? []
  const portfolioShared = sharePortfolio && holdings.length > 0
  const lessonsSent = aboutOn && shareLessons ? progress.completed : NO_LESSONS
  const aboutSent = aboutOn && (profile !== null || lessonsSent.length > 0)
  const loaded = useHydrated()
  const wide = useMediaQuery(WIDE)
  const signedIn = useSession().status === "authenticated"
  const storageBlocked = useSyncExternalStore(noop, () => !storageWorks(), () => false)
  // `focus`: put the cursor in the message box (a new chat, or a question passed in with ?q=).
  const [session, setSession] = useState(() => ({ id: newChatId(), prompt: initialPrompt, focus: initialPrompt !== "" }))
  const [panelOpen, setPanelOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // The sheet is for narrow screens only. Closed when the side panel comes on screen (a tablet
  // turned sideways), so it doesn't pop open again by itself when the tablet is turned back.
  if (wide && aboutOpen) setAboutOpen(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  // Countries turned down in this chat ("No thanks"), so the same offer isn't made again.
  const [declined, setDeclined] = useState<{ chatId: string; codes: CountryCode[] }>({ chatId: "", codes: [] })
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
    const now = new Date().toISOString()
    saveChats(
      upsertChat(current, {
        id,
        title: existing?.title ?? chatTitle(kept),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
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
  // Read from the stores as each question goes out, not from this render, so a topic chip that
  // saves and asks in one tap sends what it just saved.
  //   aboutYou: this device's About you switch. profile and completedLessons only while it's on
  //   (lessons unless "Don't use these"). holdings only while the portfolio switch is on.
  //   pastChats unless memory is off; transactions only once shared.
  const getContext = useCallback((): ChatContext => {
    const on = sharePlanStore.get()
    const finances = shareFinancesStore.get() ? financesStore.get() : null
    return {
      pastChats: memoryStore.get() ? toPastChats(chatsStore.get(), session.id) : [],
      transactions: finances?.transactions ?? [],
      aboutYou: on,
      profile: on ? profileStore.get() : null,
      completedLessons: on && shareLessonsStore.get() ? progressStore.get().completed : [],
      holdings: sharePortfolioStore.get() ? (portfolioStore.get()?.holdings ?? []) : [],
    }
  }, [session.id])

  /**
   * Opens About you: the side panel where it's on screen, otherwise the bottom sheet. `target`
   * "portfolio" focuses the portfolio switch in the side panel instead of the heading.
   */
  const openAboutYou = useCallback(
    (preview = false, target: "about" | "portfolio" = "about") => {
      if (preview) setPreviewOpen(true)
      const panel = wide ? document.getElementById("about-you-sidebar") : null
      if (panel) {
        const focus = (target === "portfolio" ? panel.querySelector<HTMLElement>("[data-portfolio-switch]") : null) ?? panel.querySelector<HTMLElement>("h2")
        ;(focus ?? panel).scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
        focus?.focus({ preventScroll: true })
      } else {
        setAboutOpen(true)
      }
    },
    [wide]
  )

  // Named in the message box, so it's clear what goes with each question on every screen size.
  // Must list everything getContext sends (AGENTS.md section 5.1).
  const shared = useMemo<SharedItem[]>(
    () => [
      ...(aboutSent ? [{ label: "About you", icon: UserRoundIcon, onSelect: () => openAboutYou() }] : []),
      ...(portfolioShared ? [{ label: "Your portfolio", icon: BriefcaseIcon, onSelect: () => openAboutYou(false, "portfolio") }] : []),
      ...(pastChats.length > 0
        ? [{ label: `${pastChats.length} past ${pastChats.length === 1 ? "chat" : "chats"}`, icon: HistoryIcon }]
        : []),
      ...(sharedFinances ? [{ label: "Your transactions", icon: FileSpreadsheetIcon }] : []),
    ],
    [aboutSent, portfolioShared, pastChats.length, sharedFinances, openAboutYou]
  )

  const personal = useMemo(
    () => (aboutOn ? personalSuggestions(profile, portfolioShared) : portfolioShared ? PORTFOLIO_SUGGESTIONS : []),
    [aboutOn, profile, portfolioShared]
  )
  const suggestions = personal.length > 0 ? personal : sharedFinances ? FINANCE_SUGGESTIONS : undefined

  /** A topic chip: saves the topic to About you, then asks its starter question, in one tap. */
  function pickFocus(id: FocusId, ask: (prompt: string) => void) {
    const before = profileStore.get()
    const { sharingTurnedOn } = updateProfile({ focus: addFocus(before?.focus ?? [], id) }, "focus")
    ask(FOCUS[id].starter)
    // After asking, which clears the last question's receipt and offer.
    setReceipt({ chatId: session.id, fields: "focus", text: `wants help with ${FOCUS[id].label}`, before, turnedOn: sharingTurnedOn, undone: false })
  }

  function rememberCountry(next: Offer) {
    // Never while About you is off here (the offer isn't shown then, but a stale click mustn't save).
    if (sharePlanChoiceStore.get() === false) return setOffer(null)
    const before = profileStore.get()
    const { sharingTurnedOn } = updateProfile({ countryCode: next.code }, "chat")
    const currency = profileCurrency(profileStore.get() ?? before ?? { country: next.name })
    setOffer(null)
    setReceipt({
      chatId: next.chatId,
      fields: "country",
      text: `you live in ${countryInSentence(next.name)}${currency ? ` (amounts in ${currency})` : ""}`,
      before,
      turnedOn: sharingTurnedOn,
      undone: false,
    })
    focusAfterTap()
  }

  function undo(saved: Receipt) {
    const current = profileStore.get()
    const restored = undoSave(current, saved.before, saved.fields)
    // A removal: it never turns About you on, and a plan deleted since stays deleted.
    if (restored) saveProfile(restored, saved.fields === "focus" ? "focus" : "chat", undefined, { mayTurnOn: false })
    else if (current) profileStore.set(null)
    // The save turned About you on; put this device back to not asked, unless it's been changed since.
    if (saved.turnedOn && sharePlanChoiceStore.get() === true) resetPlanSharing()
    setReceipt({ ...saved, undone: true })
    focusAfterTap()
  }

  function declineOffer(declinedOffer: Offer) {
    setOffer(null)
    setDeclined((current) => ({
      chatId: session.id,
      codes: [...(current.chatId === session.id ? current.codes : []), declinedOffer.code],
    }))
    focusAfterTap()
  }

  function answerBanner(on: boolean) {
    sharePlanStore.set(on)
    focusAfterTap()
  }

  function onQuestion() {
    setOffer(null)
    setReceipt(null)
  }

  function onSettled(id: string, messages: ChatMessage[], then: ChatBasis, settled: Settled) {
    saveChat(id, messages, then)
    if (!settled.complete) return
    // Never while About you is off here, or while its banner is waiting for an answer (it owns
    // this device's choice until then).
    const choice = sharePlanChoiceStore.get()
    const current = profileStore.get()
    if (choice === false || (choice === null && hasProfile(current))) return
    // The whole conversation, not just this exchange: a scam or money-trouble chat never gets one.
    const spotted = countryOffer({ messages, profile: current, declined: declined.chatId === id ? declined.codes : [] })
    if (spotted) setOffer({ chatId: id, code: spotted.code, name: spotted.name })
  }

  const bannerShown = loaded && hasProfile(profile) && aboutChoice === null
  const offerShown = !bannerShown && offer?.chatId === session.id && aboutChoice !== false ? offer : null
  const receiptShown = receipt?.chatId === session.id ? receipt : null
  // What screen readers hear after the answer, through the chat's one status line (AGENTS.md 5.1):
  // a save and what it changed, an offer or the banner waiting above the message box.
  const notice = [
    receiptShown ? receiptNotice(receiptShown, aboutChoice) : "",
    offerShown ? `Sprout offers to remember that you live in ${countryInSentence(offerShown.name)}, above the message box.` : "",
    bannerShown ? "Above the message box: use your About you details in answers on this device?" : "",
  ]
    .filter(Boolean)
    .join(" ")

  const sidebar = (sidebarId?: string) => (
    <Sidebar
      sidebarId={sidebarId}
      lessons={lessons}
      previewOpen={previewOpen}
      onPreviewOpenChange={setPreviewOpen}
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
      <aside aria-label="Saved chats, About you and finances" className="hidden w-72 shrink-0 overflow-y-auto pr-1 lg:block">
        {sidebar("about-you-sidebar")}
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
          {/* On the narrowest phones these two show only their icons, so the bar fits in 360 px. */}
          <div className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="lg:hidden" onClick={() => openAboutYou()}>
              <UserRoundIcon />
              <span className="max-[24rem]:sr-only">About you</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => startChat()}>
              <PlusIcon />
              <span className="max-[24rem]:sr-only">New chat</span>
            </Button>
          </div>
        </div>

        {panelOpen && (
          <div id="assistant-panel" className="min-h-0 flex-1 overflow-y-auto lg:hidden">
            {sidebar()}
          </div>
        )}

        {/* Hidden rather than unmounted while the panel is open, so a reply keeps streaming. */}
        <div className={cn("min-h-0 flex-1", panelOpen ? "hidden lg:flex" : "flex")}>
          <Chat
            key={session.id}
            initialMessages={activeChat?.messages ?? EMPTY}
            initialPrompt={session.prompt}
            context={getContext}
            suggestions={suggestions}
            allowDeepResearch={allowDeepResearch}
            shared={shared}
            focusOnMount={session.focus}
            intro={
              loaded
                ? (ask) => <FocusChips saved={aboutOn ? (profile?.focus ?? []) : []} onPick={(id) => pickFocus(id, ask)} />
                : undefined
            }
            afterMessages={
              receiptShown ? (
                <SavedReceipt receipt={receiptShown} choice={aboutChoice} onUndo={() => undo(receiptShown)} onPreview={() => openAboutYou(true)} />
              ) : null
            }
            aboveInput={
              bannerShown ? (
                <AboutYouBanner signedIn={signedIn} onAnswer={answerBanner} />
              ) : offerShown ? (
                <RememberOffer offer={offerShown} onRemember={() => rememberCountry(offerShown)} onDecline={() => declineOffer(offerShown)} />
              ) : null
            }
            notice={notice}
            onManageSharing={() => setPanelOpen(true)}
            onNewChat={() => startChat()}
            onQuestion={onQuestion}
            onSettled={(messages, settled) => onSettled(session.id, messages, basis, settled)}
          />
        </div>
      </div>

      {/* Phones and tablets: About you as a bottom sheet, opened from "Sent with each question". */}
      <Sheet open={aboutOpen && !wide} onOpenChange={setAboutOpen}>
        <SheetContent closeLabel="Close About you">
          <SheetTitle className="flex items-center gap-2 pr-10">
            <UserRoundIcon className="size-4 text-primary" aria-hidden="true" />
            About you
          </SheetTitle>
          <SheetDescription className="sr-only">What the assistant gets about you, and the switches for it.</SheetDescription>
          <div className="mt-2">
            <AboutYouPanel lessons={lessons} previewOpen={previewOpen} onPreviewOpenChange={setPreviewOpen} showTitle={false} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

const RECEIPT_LINK =
  "rounded px-1 font-medium text-primary underline underline-offset-4 outline-none hover:text-[color-mix(in_oklch,var(--primary),var(--foreground)_20%)] focus-visible:ring-3 focus-visible:ring-ring/50"

/** What the receipt's second line says about this device, or "" when About you is on as before. */
function receiptDeviceNote(receipt: Receipt, choice: boolean | null): string {
  if (receipt.turnedOn) return "Answers on this device now use About you. You can turn this off in About you."
  if (choice === null) return "Answers on this device don't use About you until you choose to use it here."
  if (choice === false) return "About you is off on this device, so answers here don't use it."
  return ""
}

/** The receipt as one sentence for screen readers. */
function receiptNotice(receipt: Receipt, choice: boolean | null): string {
  if (receipt.undone) return "Undone: removed from About you."
  return `Saved to About you: ${receipt.text}. ${receiptDeviceNote(receipt, choice)}`.trim()
}

/** Under the reply after a tap saved something: what was saved, Undo, and where to see it. */
function SavedReceipt({
  receipt,
  choice,
  onUndo,
  onPreview,
}: {
  receipt: Receipt
  /** This device's About you choice: on, off, or not asked yet (null). */
  choice: boolean | null
  onUndo: () => void
  onPreview: () => void
}) {
  // tabIndex -1: focus lands here after Undo or Remember on touch screens (focusAfterTap).
  if (receipt.undone) {
    return (
      <p id="about-you-receipt" tabIndex={-1} className="animate-rise px-1 text-xs text-muted-foreground outline-none">
        Undone: removed from About you.
      </p>
    )
  }
  const deviceNote = receiptDeviceNote(receipt, choice)
  return (
    <div id="about-you-receipt" tabIndex={-1} className="animate-rise space-y-1 rounded-xl border bg-background px-3 py-2 text-xs outline-none">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <CheckIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Saved to About you: {receipt.text}.
        </span>
        <button type="button" onClick={onUndo} className={RECEIPT_LINK}>
          Undo
        </button>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <button type="button" onClick={onPreview} className={RECEIPT_LINK}>
          See what the assistant gets
        </button>
      </p>
      {deviceNote && <p className="text-muted-foreground">{deviceNote}</p>}
    </div>
  )
}

/**
 * A device that hasn't been asked yet (a new browser, or after signing out and back in) while About
 * you has details: nothing from About you is sent from here until the person answers.
 */
function AboutYouBanner({ signedIn, onAnswer }: { signedIn: boolean; onAnswer: (on: boolean) => void }) {
  return (
    <div className="animate-rise mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background px-3 py-2 text-sm">
      <UserRoundIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-56">
        {signedIn
          ? "Your About you details came from your account. Use them in answers on this device?"
          : "You have About you details saved in this browser. Use them in answers?"}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onAnswer(true)}>
          Use them
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onAnswer(false)}>
          Not now
        </Button>
      </div>
    </div>
  )
}

/** "Remember that you live in …?" after the person said so in their own message. One tap saves it. */
function RememberOffer({ offer, onRemember, onDecline }: { offer: Offer; onRemember: () => void; onDecline: () => void }) {
  return (
    <div className="animate-rise mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background px-3 py-2 text-sm">
      <MapPinIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-56">
        Remember that you live in {countryInSentence(offer.name)}? Account and tax answers depend on it.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRemember}>
          Remember
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDecline}>
          No thanks
        </Button>
      </div>
    </div>
  )
}

function Sidebar({
  sidebarId,
  lessons,
  previewOpen,
  onPreviewOpenChange,
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
  /** Set on the side panel's copy only, so About you can be found and focused there. */
  sidebarId?: string
  lessons: readonly CourseLesson[]
  previewOpen: boolean
  onPreviewOpenChange: (open: boolean) => void
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

      <div id={sidebarId}>
        <AboutYouPanel lessons={lessons} previewOpen={previewOpen} onPreviewOpenChange={onPreviewOpenChange} />
      </div>

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
