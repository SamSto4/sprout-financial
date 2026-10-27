import type { Metadata } from "next"

import { Assistant } from "@/components/assistant"
import { isWebSearchEnabled } from "@/lib/ai/skill-tools"
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/validate"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"

export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.assistant)

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  // Other pages link here with ?q=<question> to pre-fill the message box.
  const { q } = await searchParams
  const initialPrompt = typeof q === "string" ? q.slice(0, MAX_MESSAGE_LENGTH) : ""

  return (
    // Fill the screen below the 65px header so only the conversation scrolls.
    <main className="flex h-[calc(100svh-65px)] flex-col items-center bg-surface px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
      <h1 className="sr-only">Ask Sprout&apos;s AI money coach</h1>
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <Assistant key={initialPrompt} initialPrompt={initialPrompt} allowDeepResearch={isWebSearchEnabled()} />
      </div>
    </main>
  )
}
