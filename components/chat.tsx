"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpIcon, SquareIcon, TelescopeIcon } from "lucide-react"
import { cn } from "cn"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { ChatMarkdown } from "@/components/chat-markdown"
import { ChatSuggestions, type Suggestion } from "@/components/chat-suggestions"
import { readEvents } from "@/lib/chat/stream"
import { MAX_MESSAGE_LENGTH, type ChatContext, type ChatMessage } from "@/lib/chat/validate"

type Status = "idle" | "waiting" | "streaming"

export function Chat({
  initialMessages = [],
  initialPrompt = "",
  context,
  suggestions,
  draft,
  allowDeepResearch = true,
  onSettled,
}: {
  initialMessages?: ChatMessage[]
  initialPrompt?: string
  /** Saved chats and imported transactions sent along so the assistant can use them. */
  context?: ChatContext
  suggestions?: Suggestion[]
  /** Puts text in the message box without sending it. A new id replaces the current draft. */
  draft?: { id: number; text: string }
  /** Shows the Deep research switch, which runs several web searches for one question. */
  allowDeepResearch?: boolean
  /** Called with the conversation once a reply finishes, stops or drops, so it can be saved. */
  onSettled?: (messages: ChatMessage[]) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  // A question passed in from another page is placed in the box, not sent, so nothing runs without a click.
  const [input, setInput] = useState(initialPrompt)
  const [status, setStatus] = useState<Status>("idle")
  const [draftId, setDraftId] = useState(draft?.id)
  const [error, setError] = useState<string | null>(null)
  // A short progress note from the server, such as "Searching the web", shown until text arrives.
  const [activity, setActivity] = useState<string | null>(null)
  const [deepResearch, setDeepResearch] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // A new draft from the parent replaces the box's text (adjusting state during render, not in an effect).
  if (draft && draft.id !== draftId) {
    setDraftId(draft.id)
    setInput(draft.text)
  }

  const busy = status !== "idle"
  const tooLong = input.length > MAX_MESSAGE_LENGTH

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages, status])

  // Stop any reply in progress if the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy || content.length > MAX_MESSAGE_LENGTH) return

    const history: ChatMessage[] = [...messages, { role: "user", content }]
    setMessages([...history, { role: "assistant", content: "" }])
    setInput("")
    setError(null)
    setActivity(deepResearch ? "Planning the research" : null)
    setStatus("waiting")

    const controller = new AbortController()
    abortRef.current = controller
    let reply = ""
    let answered = true

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context, mode: deepResearch ? "deep-research" : "standard" }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null)
        throw new RequestError(data?.error ?? "The assistant couldn't answer. Please try again.")
      }

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

      if (err instanceof RequestError) {
        // Nothing was answered: remove the turn and give the question back so it can be retried.
        answered = false
        setMessages(messages)
        setInput(content)
        setError(err.message)
      } else {
        setError("The connection dropped before the answer finished. You can ask again.")
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setStatus("idle")
      setActivity(null)
      // Save whatever arrived, including a partial answer from a stop or a dropped connection.
      if (answered) onSettled?.([...history, { role: "assistant", content: reply }])
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div className="-mx-1 flex-1 overflow-y-auto px-1 py-2" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center py-6">
            <ChatSuggestions suggestions={suggestions} onSelect={send} />
          </div>
        ) : (
          <ol className="flex flex-col gap-6 pb-4">
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1
              const pending = isLast && message.role === "assistant" && !message.content
              if (message.role === "user") {
                return (
                  <li key={index} className="animate-rise max-w-[85%] self-end">
                    <span className="sr-only">You said:</span>
                    <p className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground">
                      {message.content}
                    </p>
                  </li>
                )
              }
              return (
                <li key={index} className="animate-rise flex gap-3">
                  <BrandMark className="mt-0.5 size-7 shrink-0" />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-card px-4 py-3 text-[15px] shadow-[0_1px_2px_rgb(24_53_42/0.04)]">
                    <span className="sr-only">Assistant said:</span>
                    {pending ? (
                      busy ? (
                        <Working label={activity ?? "Thinking"} />
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Stopped before answering.</span>
                      )
                    ) : (
                      <>
                        <ChatMarkdown>{message.content}</ChatMarkdown>
                        {isLast && busy && activity && (
                          <div className="mt-2 border-t pt-2">
                            <Working label={activity} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-[#a33b3b]"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send(input)
        }}
        className="flex flex-col gap-1 rounded-2xl border bg-background p-2 shadow-[0_1px_2px_rgb(24_53_42/0.04),0_8px_24px_-16px_rgb(24_53_42/0.2)] transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask a money question
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send(input)
            }
          }}
          rows={1}
          placeholder={deepResearch ? "What should I research for you?" : "Ask about budgeting, saving, debt, investing…"}
          aria-invalid={tooLong}
          aria-describedby="chat-help"
          className="max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none field-sizing-content placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-2">
          {allowDeepResearch ? (
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
          ) : (
            <span />
          )}
          {busy ? (
            <Button type="button" size="icon-lg" onClick={stop} aria-label="Stop the answer" className="rounded-xl">
              <SquareIcon className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-lg"
              disabled={!input.trim() || tooLong}
              aria-label="Send"
              className="rounded-xl"
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </form>

      <p
        id="chat-help"
        className={cn("mt-2 text-center text-xs", tooLong ? "text-[#a33b3b]" : "text-muted-foreground")}
      >
        {tooLong
          ? `That message is ${input.length.toLocaleString()} characters. The limit is ${MAX_MESSAGE_LENGTH.toLocaleString()}.`
          : deepResearch
            ? "Deep research searches and reads several sources, then writes a report. It takes a minute or two."
            : "Educational information, not financial advice. The assistant can make mistakes, so check important numbers."}
      </p>
    </div>
  )
}

class RequestError extends Error {}

function Working({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground" role="status">
      {label}
      <span className="flex gap-1" aria-hidden="true">
        <span className="animate-pulse-dot size-1.5 rounded-full bg-brand" />
        <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.15s]" />
        <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.3s]" />
      </span>
    </span>
  )
}
