"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { cn } from "cn"

import { BrandMark } from "@/components/brand-mark"
import { ChatMarkdown } from "@/components/chat-markdown"
import { Button } from "@/components/ui/button"
import { copyText } from "@/lib/chat/plain-text"

/** A question the user sent: a dark green bubble on the right. */
export function UserMessage({ content }: { content: string }) {
  return (
    <li className="animate-rise max-w-[85%] self-end">
      <span className="sr-only">You said:</span>
      <p className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground">
        {content}
      </p>
    </li>
  )
}

/**
 * One reply: the brand mark (from the sm breakpoint up, so phones get the full width), a white
 * card with the Markdown, and a Copy action once the reply is complete.
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
    <li className="animate-rise flex gap-3">
      <BrandMark className="mt-0.5 size-7 shrink-0 max-sm:hidden" />
      <div className={cn("min-w-0", empty ? "flex-none" : "flex-1")}>
        <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 text-[15px] shadow-[0_1px_2px_rgb(24_53_42/0.04)]">
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
                (activity ? (
                  <div className="mt-2 border-t pt-2">
                    <Working label={activity} />
                  </div>
                ) : (
                  <TypingDots className="mt-2" />
                ))}
            </>
          )}
        </div>
        {!working && !empty && (
          <div className="mt-1 flex items-center gap-2">
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
    <Button type="button" variant="ghost" size="xs" onClick={copy} className="text-muted-foreground hover:text-foreground">
      {state === "copied" ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}</span>
    </Button>
  )
}

/** A progress note with three pulsing dots, such as "Searching the web: ISA allowance". */
export function Working({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
      {label}
      <TypingDots />
    </span>
  )
}

/** Three pulsing dots: more of the reply is on its way. Decorative; the live region speaks for it. */
function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex gap-1", className)} aria-hidden="true">
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand" />
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.15s]" />
      <span className="animate-pulse-dot size-1.5 rounded-full bg-brand [animation-delay:0.3s]" />
    </span>
  )
}
