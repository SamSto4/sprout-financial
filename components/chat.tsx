"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, PlusIcon, RotateCcwIcon, ShieldCheckIcon, SquareIcon, TelescopeIcon, type LucideIcon } from "lucide-react"
import { cn } from "cn"

import { AssistantMessage, UserMessage } from "@/components/chat-message"
import { ChatSuggestions, type Suggestion } from "@/components/chat-suggestions"
import { Button } from "@/components/ui/button"
import { spokenText } from "@/lib/chat/plain-text"
import { redactSensitiveNumbers } from "@/lib/chat/redact"
import { readEvents } from "@/lib/chat/stream"
import { failureAction, lengthHint, nextPinned } from "@/lib/chat/ui"
import { MAX_MESSAGE_LENGTH, validateChatRequest, type ChatContext, type ChatMessage } from "@/lib/chat/validate"
import { useMediaQuery } from "@/lib/use-media-query"

type Status = "idle" | "waiting" | "streaming"

/**
 * Something sent with every question (past chats, About you, transactions), shown in the message
 * box. With `onSelect` it's a button that opens its controls.
 */
export type SharedItem = { label: string; icon: LucideIcon; onSelect?: () => void }

/** How a reply ended, for what the page offers after it. */
export type Settled = {
  /** True when the answer finished: not stopped, not failed, not empty. */
  complete: boolean
}

/** A question that failed, kept so "Try again" can send it again from the same point. */
type Failure = {
  message: string
  action: "retry" | "new-chat" | "none"
  question: string
  /** The conversation before the question, which a retry starts from. */
  base: ChatMessage[]
  /** True when part of an answer arrived before the connection dropped. */
  partial: boolean
}

const OFFLINE = "Couldn't reach the assistant. Check your connection and try again."
const DROPPED = "The connection dropped before the answer finished."
const FAILED = "The assistant couldn't answer. Please try again."
const MASKED = "A card, account or ID number was hidden before sending. You never need to share those here."

/** Coarse pointers are touch screens: no uninvited keyboards, and Enter adds a new line there. */
const TOUCH = "(pointer: coarse)"

export function Chat({
  initialMessages = [],
  initialPrompt = "",
  context,
  suggestions,
  draft,
  allowDeepResearch = true,
  shared = [],
  focusOnMount = false,
  intro,
  afterMessages,
  aboveInput,
  notice,
  onManageSharing,
  onNewChat,
  onQuestion,
  onSettled,
}: {
  initialMessages?: ChatMessage[]
  initialPrompt?: string
  /**
   * Saved chats and imported transactions sent along so the assistant can use them. A function is
   * called as each question is sent, so a tap that saves something and asks in the same moment
   * (a topic chip) sends what was just saved.
   */
  context?: ChatContext | (() => ChatContext)
  suggestions?: Suggestion[]
  /** Puts text in the message box without sending it. A new id replaces the current draft. */
  draft?: { id: number; text: string }
  /** Shows the Deep research switch, which runs several web searches for one question. */
  allowDeepResearch?: boolean
  /** What `context` sends with each question, named in the message box so it's never a surprise. */
  shared?: SharedItem[]
  /** Puts the cursor in the message box when the chat opens (not on touch screens). */
  focusOnMount?: boolean
  /** Shown in the empty chat above the suggestions; `ask` sends a question as a suggestion does. */
  intro?: (ask: (prompt: string) => void) => ReactNode
  /** Shown under the conversation (a receipt for something just saved). */
  afterMessages?: ReactNode
  /** Shown just above the message box (a banner or a one-tap offer). */
  aboveInput?: ReactNode
  /**
   * A sentence screen readers hear after the answer, in the same status line (a receipt for
   * something just saved, an offer above the box), since those aren't live regions themselves.
   */
  notice?: string
  /** Opens the controls for what's shared (the sidebar panel on small screens). */
  onManageSharing?: () => void
  /** Starts a fresh conversation, offered when this one is too long to continue. */
  onNewChat?: () => void
  /** Called with each question as sent: after card and ID numbers were masked, and only once it's going out. */
  onQuestion?: (content: string) => void
  /** Called with the conversation once a reply finishes, stops or drops, so it can be saved. */
  onSettled?: (messages: ChatMessage[], settled: Settled) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  // A question passed in from another page is placed in the box, not sent, so nothing runs without a click.
  const [input, setInput] = useState(initialPrompt)
  const [status, setStatus] = useState<Status>("idle")
  const [draftId, setDraftId] = useState(draft?.id)
  const [failure, setFailure] = useState<Failure | null>(null)
  // A short progress note from the server, such as "Searching the web", shown until text arrives.
  const [activity, setActivity] = useState<string | null>(null)
  // What screen readers hear: progress notes, then the finished answer once (never each streamed word).
  const [announcement, setAnnouncement] = useState("")
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)
  const [deepResearch, setDeepResearch] = useState(false)
  const [showJump, setShowJump] = useState(false)
  // Shown after a question in which a card, account or ID number was masked (lib/chat/redact.ts).
  const [maskedNumber, setMaskedNumber] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  // Whether new text should keep the latest in view (the reader hasn't scrolled up).
  const pinnedRef = useRef(true)
  // The scroll position last seen, to tell which way the reader moved.
  const lastTopRef = useRef(0)
  const touch = useMediaQuery(TOUCH)

  // A new draft from the parent replaces the box's text (adjusting state during render, not in an effect).
  if (draft && draft.id !== draftId) {
    setDraftId(draft.id)
    setInput(draft.text)
  }

  const busy = status !== "idle"
  const tooLong = input.length > MAX_MESSAGE_LENGTH
  const count = lengthHint(input.length, MAX_MESSAGE_LENGTH)
  const hasMessages = messages.length > 0
  // The server refuses a conversation past its size limits; say so before anyone types into it.
  // Same rules as the server (validateChatRequest), checked only between replies.
  const full = useMemo(
    () => !busy && hasMessages && !validateChatRequest({ messages: [...messages, { role: "user", content: "?" }] }).ok,
    [busy, hasMessages, messages]
  )

  const focusInput = useCallback(() => {
    // On touch screens focusing the box pops up the keyboard, so leave focus where it is.
    if (window.matchMedia(TOUCH).matches) return
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (focusOnMount) focusInput()
  }, [focusOnMount, focusInput])

  // "Jump to latest" shows whenever the view isn't following the reply.
  const setPinned = useCallback((pinned: boolean) => {
    pinnedRef.current = pinned
    setShowJump(!pinned)
  }, [])

  // Follow the reply while the reader is at the bottom; once they scroll up, leave them be.
  const follow = useCallback(() => {
    const box = scrollRef.current
    if (!box) return
    // The reader may have scrolled since the last scroll event; check before pulling them down.
    const pinned = nextPinned(box, lastTopRef.current, pinnedRef.current)
    if (pinned !== pinnedRef.current) setPinned(pinned)
    if (pinned) box.scrollTop = box.scrollHeight
    lastTopRef.current = box.scrollTop
  }, [setPinned])

  useLayoutEffect(() => {
    if (hasMessages) follow()
  }, [messages, activity, hasMessages, follow])

  // Charts size themselves after rendering; keep following them too.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(follow)
    observer.observe(list)
    return () => observer.disconnect()
  }, [hasMessages, follow])

  // Stop any reply in progress if the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  function onScroll() {
    const box = scrollRef.current
    if (!box) return
    const pinned = nextPinned(box, lastTopRef.current, pinnedRef.current)
    lastTopRef.current = box.scrollTop
    if (pinned !== pinnedRef.current) setPinned(pinned)
  }

  function jumpToLatest() {
    const box = scrollRef.current
    if (!box) return
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // A smooth scroll only moves down, so it keeps following on the way (nextPinned).
    setPinned(true)
    box.scrollTo({ top: box.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    // The button disappears once clicked; the box is the useful place for focus to land.
    focusInput()
  }

  /**
   * Sends a question. `base` is the conversation it follows (a retry passes the one from before
   * the failed question). `fromBox` is false when the text didn't come from the message box, so
   * whatever the user is typing there is left alone.
   */
  async function send(text: string, base: ChatMessage[] = messages, fromBox = true) {
    // Card, account and ID numbers are masked before the question is shown, saved or sent, so the
    // number itself never reaches this device's storage, the account or the assistant.
    const { text: masked, masked: maskedCount } = redactSensitiveNumbers(text)
    const content = masked.trim()
    if (!content || busy || content.length > MAX_MESSAGE_LENGTH) return

    const history: ChatMessage[] = [...base, { role: "user", content }]
    const check = validateChatRequest({ messages: history })
    if (!check.ok) {
      // Only the size limits can fail here; the server would refuse the same way.
      setFailure({ message: check.error, action: onNewChat ? "new-chat" : "none", question: content, base, partial: false })
      return
    }

    onQuestion?.(content)
    setMessages([...history, { role: "assistant", content: "" }])
    if (fromBox) setInput("")
    setFailure(null)
    setMaskedNumber(maskedCount > 0)
    setStoppedAt((index) => (index !== null && index < base.length ? index : null))
    const firstNote = deepResearch ? "Planning the research" : null
    setActivity(firstNote)
    setAnnouncement(`${maskedCount > 0 ? `${MASKED} ` : ""}${firstNote ?? "Thinking"}`)
    setStatus("waiting")
    // Asking a question always brings the view back to the latest.
    setPinned(true)

    const controller = new AbortController()
    abortRef.current = controller
    let reply = ""
    let answered = true
    let failed = false
    // Whether the server started answering, to tell a dropped answer from no connection at all.
    let connected = false

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          context: typeof context === "function" ? context() : context,
          mode: deepResearch ? "deep-research" : "standard",
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null)
        throw new RequestError(typeof data?.error === "string" ? data.error : FAILED, response.status)
      }

      connected = true
      setStatus("streaming")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      // The reply arrives as one JSON event per line: text to append, or a progress note.
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const { events, rest } = readEvents(buffer + decoder.decode(value, { stream: true }))
        buffer = rest
        let changed = false
        for (const event of events) {
          if (event.type === "status") {
            setActivity(event.text)
            setAnnouncement(event.text)
          } else {
            reply += event.text
            changed = true
          }
        }
        if (changed) {
          setActivity(null)
          setMessages([...history, { role: "assistant", content: reply }])
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return
      failed = true
      const httpStatus = err instanceof RequestError ? err.status : null
      if (!reply) {
        // Nothing was answered: take the turn back and return the question to the box, unless
        // something new has been typed there since.
        answered = false
        setMessages(base)
        setInput((current) => (current.trim() ? current : content))
        const message = err instanceof RequestError ? err.message : connected ? FAILED : OFFLINE
        setFailure({ message, action: failureAction(httpStatus), question: content, base, partial: false })
      } else {
        setFailure({ message: DROPPED, action: "retry", question: content, base, partial: true })
      }
      setAnnouncement("")
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setStatus("idle")
      setActivity(null)
      if (controller.signal.aborted) {
        setAnnouncement("Stopped.")
        if (reply) setStoppedAt(history.length)
      } else if (!failed) {
        setAnnouncement(reply ? `Answer: ${spokenText(reply)}` : "")
      }
      // Focus was on the Send/Stop button or nowhere; put it back in the box for the next question.
      const active = document.activeElement
      if (!active || active === document.body || active.closest("form") === inputRef.current?.form) focusInput()
      // Save whatever arrived, including a partial answer from a stop or a dropped connection.
      if (answered) {
        const complete = !failed && !controller.signal.aborted && reply.trim() !== ""
        onSettled?.([...history, { role: "assistant", content: reply }], { complete })
      }
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function retry() {
    if (!failure) return
    // A partial answer is replaced by a new one; otherwise the question is back in the box, maybe edited.
    if (failure.partial) send(failure.question, failure.base, false)
    else send(input.trim() ? input : failure.question, failure.base)
    // The banner and its button go away while the question is asked again; keep focus in the box.
    focusInput()
  }

  function pickSuggestion(prompt: string) {
    // Anything already typed in the box stays there.
    send(prompt, messages, false)
    // The suggestion buttons disappear once the conversation starts; keep focus somewhere useful.
    focusInput()
  }

  // Enter sends with a keyboard; on touch screens it adds a new line and the button sends.
  // Ctrl or Cmd + Enter sends everywhere.
  const enterSends = !touch

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="region"
          aria-label="Conversation"
          tabIndex={hasMessages ? 0 : undefined}
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg px-1 py-2 focus-visible:outline-offset-[-2px]"
        >
          {!hasMessages ? (
            <div className="flex min-h-full py-6">
              {/* Auto margins center without ever pushing the top out of view when it's taller than the box. */}
              <ChatSuggestions
                suggestions={suggestions}
                onSelect={pickSuggestion}
                intro={intro}
                className="m-auto"
              />
            </div>
          ) : (
            <ol ref={listRef} className="flex flex-col gap-6 pb-4">
              {messages.map((message, index) => {
                if (message.role === "user") return <UserMessage key={index} content={message.content} />
                const isLast = index === messages.length - 1
                return (
                  <AssistantMessage
                    key={index}
                    content={message.content}
                    working={isLast && busy}
                    activity={isLast ? activity : null}
                    stopped={index === stoppedAt}
                  />
                )
              })}
              {afterMessages && !busy && <li className="-mt-3 list-none sm:pl-10">{afterMessages}</li>}
            </ol>
          )}
        </div>
        {showJump && hasMessages && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="animate-rise absolute inset-x-0 bottom-3 mx-auto inline-flex w-fit items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-primary shadow-[0_4px_16px_-6px_rgb(24_53_42/0.35)] transition-colors hover:bg-secondary"
          >
            <ArrowDownIcon className="size-3.5" aria-hidden="true" />
            Jump to latest
          </button>
        )}
      </div>

      {/* Screen readers hear progress notes and the finished answer here, once each. */}
      <p role="status" className="sr-only">
        {announcement}
        {notice && !busy ? <span> {notice}</span> : null}
      </p>

      {failure && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]">
          <CircleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
          <p role="alert" className="min-w-0 flex-1">
            {failure.message}
          </p>
          {failure.action === "retry" && (
            <Button type="button" variant="outline" size="sm" onClick={retry} disabled={busy}>
              <RotateCcwIcon aria-hidden="true" />
              Try again
            </Button>
          )}
          {failure.action === "new-chat" && onNewChat && (
            <Button type="button" variant="outline" size="sm" onClick={onNewChat}>
              <PlusIcon aria-hidden="true" />
              Start a new chat
            </Button>
          )}
        </div>
      )}

      {maskedNumber && (
        // Screen readers hear this with "Thinking" (the announcement above), so it isn't a live region.
        <p className="mb-2 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {MASKED}
        </p>
      )}

      {aboveInput}

      {full && !failure && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 text-muted-foreground">This chat has reached its length limit. Start a new one to keep going.</p>
          {onNewChat && (
            <Button type="button" variant="outline" size="sm" onClick={onNewChat}>
              <PlusIcon aria-hidden="true" />
              Start a new chat
            </Button>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(input)
        }}
        className="flex flex-col gap-1 rounded-2xl border bg-background p-2 shadow-[0_1px_2px_rgb(24_53_42/0.04),0_8px_24px_-16px_rgb(24_53_42/0.2)] transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
      >
        {shared.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1">
            <span className="text-xs text-muted-foreground">Sent with each question:</span>
            {shared.map(({ label, icon: Icon, onSelect }) =>
              onSelect ? (
                <button
                  key={label}
                  type="button"
                  onClick={onSelect}
                  className="inline-flex min-h-6 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary underline-offset-2 transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)] hover:underline"
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {label}
                </button>
              ) : (
                <span key={label} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Icon className="size-3" aria-hidden="true" />
                  {label}
                </span>
              )
            )}
            {onManageSharing && (
              <button
                type="button"
                onClick={onManageSharing}
                className="-my-1 inline-flex min-h-6 items-center rounded px-1.5 text-xs font-medium text-primary underline underline-offset-4 lg:hidden"
              >
                Change
              </button>
            )}
          </div>
        )}
        <label htmlFor="chat-input" className="sr-only">
          Ask a money question
        </label>
        <textarea
          ref={inputRef}
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
            if (enterSends || event.metaKey || event.ctrlKey) {
              event.preventDefault()
              send(input)
            }
          }}
          rows={1}
          enterKeyHint={enterSends ? "send" : "enter"}
          placeholder={deepResearch ? "What should I research for you?" : "Ask about budgeting, saving, debt, investing…"}
          aria-invalid={tooLong}
          aria-describedby="chat-keys chat-count"
          className="max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none field-sizing-content placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2">
          {allowDeepResearch && (
            <button
              type="button"
              onClick={() => setDeepResearch((on) => !on)}
              aria-pressed={deepResearch}
              disabled={busy}
              title="Searches the web from several angles and reads full sources. Takes a minute or two."
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                deepResearch ? "border-brand bg-secondary text-primary" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <TelescopeIcon className="size-3.5" aria-hidden="true" />
              Deep research
            </button>
          )}
          {allowDeepResearch && deepResearch && (
            <span className="text-[11px] text-muted-foreground max-sm:hidden">Takes a minute or two</span>
          )}
          <span id="chat-count" className={cn("figures ml-auto text-[11px]", count?.over ? "font-medium text-[#a33b3b]" : "text-muted-foreground")}>
            {count?.text}
          </span>
          {busy ? (
            <Button type="button" variant="secondary" size="lg" onClick={stop} className="rounded-xl px-3">
              <SquareIcon className="size-3 fill-current" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="icon-lg" disabled={!input.trim() || tooLong} aria-label="Send" className="rounded-xl">
              <ArrowUpIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
      <p id="chat-keys" className="sr-only">
        {enterSends ? "Press Enter to send, or Shift and Enter for a new line." : "Use the Send button to send. Enter adds a new line."}
      </p>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        <span className="sm:hidden">Educational, not financial advice. Check important numbers.</span>
        <span className="max-sm:hidden">
          Educational information, not financial advice. The assistant can make mistakes, so check important numbers.
        </span>
      </p>
    </div>
  )
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}
