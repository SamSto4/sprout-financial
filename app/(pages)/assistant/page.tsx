import type { Metadata, Viewport } from "next"

import { Assistant } from "@/components/assistant"
import { isWebSearchEnabled } from "@/lib/ai/skill-tools"
import { chatIdFromParam } from "@/lib/chat/history"
import { LESSONS } from "@/lib/learn/course"
import { prefilledQuestion } from "@/lib/chat/validate"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"

export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.assistant)

// On Android, shrink the page when the on-screen keyboard opens, so the message box stays above it.
export const viewport: Viewport = { interactiveWidget: "resizes-content" }

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  // Other pages link here with ?q=<question> to pre-fill the message box. It's one short line, like
  // every question the site itself links with, so a crafted link can't hide an instruction several
  // lines down, out of sight in the box, for the reader to send along with an innocent first line.
  const { q, chat } = await searchParams
  const initialPrompt = typeof q === "string" ? prefilledQuestion(q) : ""
  // ?chat=<id> opens that saved chat (the signed-in home's "Pick up a conversation"), if it's saved here.
  const initialChatId = chatIdFromParam(chat)
  // The course outline only (slug and title), so the lesson text stays out of the browser bundle.
  // About you's preview runs the server's own summary function on it (lib/plan/about-card.ts).
  const lessons = LESSONS.map(({ slug, title }) => ({ slug, title }))

  return (
    // Fill the screen below the 65px header so only the conversation scrolls.
    <main className="flex h-[calc(100svh-65px)] flex-col items-center bg-surface px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
      <h1 className="sr-only">Ask Sprout&apos;s AI money coach</h1>
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <Assistant
          key={`${initialChatId ?? ""}\n${initialPrompt}`}
          initialPrompt={initialPrompt}
          initialChatId={initialChatId}
          allowDeepResearch={isWebSearchEnabled()}
          lessons={lessons}
        />
      </div>
    </main>
  )
}
