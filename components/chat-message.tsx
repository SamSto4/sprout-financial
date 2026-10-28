"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { cn } from "cn"

import { BrandMark } from "@/components/brand-mark"
import { ChatMarkdown } from "@/components/chat-markdown"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/chat/plain-text"

/** A question the user sent: a soft green bubble on the right. */
export function UserMessage({ content }: { content: string }) {
  return (
    <li className="animate-rise max-w-[85%] self-end [animation-duration:250ms] sm:max-w-[75%]">
      <span className="sr-only">You said:</span>
      <p className="rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground ring-1 ring-brand/15 ring-inset">
        {content}
      </p>
    </li>
  )
}

/**
 * One reply: the brand mark (from the sm breakpoint up, so phones get the full width), the
 * Markdown as prose on the page (no bubble), and a Copy action once the reply is complete.
 * - `working`: the reply is still being written. `activity` is the latest progress note.
 * - `stopped`: the user pressed Stop partway through this reply (this visit only; not saved).
 */
export function AssistantMessage({
  content,
  working,
  activity,
  stopped,
}: {
  content: string
  working: boolean
  activity: string | null
  stopped: boolean
}) {
  const empty = !content
  return (
    <li className="animate-rise flex gap-3 [animation-duration:250ms]">
      <BrandMark className="mt-0.5 size-7 shrink-0 max-sm:hidden" />
      <div className="min-w-0 flex-1 pt-0.5 text-[15px] text-foreground">
        <span className="sr-only">Assistant said:</span>
        {empty ? (
          working ? (
            <Working label={activity ?? "Thinking"} />
          ) : (
            <span className="text-sm text-muted-foreground italic">Stopped before answering.</span>
          )
        ) : (
          <>
            <ChatMarkdown>{content}</ChatMarkdown>
            {working &&
              (activity ? <Working label={activity} className="mt-3" /> : <TypingDots className="mt-3 h-5 items-center" />)}
          </>
        )}
        {!working && !empty && (
          <div className="mt-2 -ml-2 flex items-center gap-2">
            <CopyButton markdown={content} />
            {stopped && <span className="text-xs text-muted-foreground">You stopped this answer early.</span>}
          </div>
        )}
      </div>
    </li>
  )
}

/** Copies a reply as Markdown, with charts and tables named instead of their JSON. */
function CopyButton({ markdown }: { markdown: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      // navigator.clipboard is missing on plain-http addresses; that lands in the catch too.
      await navigator.clipboard.writeText(copyText(markdown))
      setState("copied")
    } catch {
      setState("failed")
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={copy}
      className="relative text-muted-foreground after:absolute after:inset-x-0 after:-inset-y-2.5 hover:text-foreground"
    >
      {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}</span>
    </Button>
  )
}

/** A progress note with three pulsing dots, such as "Searching the web: ISA allowance". */
export function Working({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border bg-background py-1.5 pr-3 pl-2.5 text-[13px] text-muted-foreground shadow-xs",
        className
      )}
    >
      <TypingDots />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

/** Three pulsing dots: more of the reply is on its way. Decorative; the live region speaks for it. */
function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex shrink-0 gap-1", className)} aria-hidden="true">
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand" />
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.15s]" />
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.3s]" />
    </span>
  )
}
