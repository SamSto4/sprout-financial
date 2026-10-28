import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import { createClient, fallbackOptions, SCREENSHOT_MODEL } from "@/lib/ai/client"
import { mayHaveBeenBilled } from "@/lib/ai/error-kinds"
import { estimateCostUsd, unfinishedScreenshotCostUsd } from "@/lib/ai/spend"
import { recordSpend } from "@/lib/ai/spend-server"
import { HOLDINGS_SCREENSHOT_PROMPT, screenshotPiecesNote, TRANSACTION_SCREENSHOT_PROMPT } from "@/lib/ai/system-prompt"
import { HOLDINGS_SCREENSHOT_SCHEMA, readHoldingsScreenshot, type HoldingsScreenshot } from "@/lib/screenshots/holding-rows"
import type { ScreenshotKind, ScreenshotUpload } from "@/lib/screenshots/image"
import { readTransactionScreenshot, TRANSACTION_SCREENSHOT_SCHEMA, type TransactionScreenshot } from "@/lib/screenshots/transaction-rows"

/** A failure worth showing the user as-is (the model declined, or returned something unusable). */
export class ScreenshotError extends Error {}

type Effort = "low" | "medium" | "high"

// Reading text off a screen needs little reasoning, so effort stays low: in the screenshot evals
// (npm run eval:screenshots -- --effort medium) medium was no more accurate on Haiku or Sonnet,
// a little slower, and on tiny text Haiku "corrected" names it couldn't make out.
const DEFAULT_EFFORT: Effort = "low"
// A full screen of transactions is a few thousand tokens of JSON; thinking counts toward this too.
// A tall capture in pieces can hold a month of rows (about 45 tokens each), so it gets more room.
const MAX_TOKENS = 8000
const MAX_TOKENS_PIECES = 16000

const KINDS = {
  transactions: {
    system: TRANSACTION_SCREENSHOT_PROMPT,
    schema: TRANSACTION_SCREENSHOT_SCHEMA,
    ask: "Transcribe the transactions in this screenshot.",
    read: readTransactionScreenshot,
  },
  holdings: {
    system: HOLDINGS_SCREENSHOT_PROMPT,
    schema: HOLDINGS_SCREENSHOT_SCHEMA,
    ask: "Transcribe the holdings in this screenshot.",
    read: readHoldingsScreenshot,
  },
}

export type ScreenshotResult<K extends ScreenshotKind> = K extends "transactions" ? TransactionScreenshot : HoldingsScreenshot

/**
 * Reads one screenshot with Claude and returns its rows, checked (lib/screenshots). `images` is
 * one image, or the pieces of a tall capture in order (planScreenshot), read together. The images
 * are held only for this call: they aren't stored or logged here.
 */
export async function readScreenshot<K extends ScreenshotKind>(
  kind: K,
  images: ScreenshotUpload | ScreenshotUpload[],
  options: {
    signal?: AbortSignal
    effort?: Effort
    /** Called with the call's estimated cost in US dollars. The screenshot evals use it; it only observes. */
    onCost?: (usd: number) => void
  } = {}
): Promise<ScreenshotResult<K>> {
  const config = KINDS[kind]
  const pieces = Array.isArray(images) ? images : [images]
  const maxTokens = pieces.length > 1 ? MAX_TOKENS_PIECES : MAX_TOKENS
  let response: Anthropic.Beta.Messages.BetaMessage
  try {
    response = await createClient().beta.messages.create(
      {
        model: SCREENSHOT_MODEL,
        max_tokens: maxTokens,
        system: config.system,
        messages: [
          {
            role: "user",
            // The images come before the question, which Anthropic's vision guide recommends.
            content: [
              ...pieces.map((image) => ({ type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType, data: image.data } })),
              { type: "text", text: pieces.length > 1 ? `${screenshotPiecesNote(pieces.length)}\n\n${config.ask}` : config.ask },
            ],
          },
        ],
        output_config: { effort: options.effort ?? DEFAULT_EFFORT, format: { type: "json_schema", schema: config.schema } },
        ...fallbackOptions(SCREENSHOT_MODEL),
      },
      { signal: options.signal }
    )
  } catch (error) {
    // Stopped (the person left the page) or cut off: the model may have read the image anyway and
    // no response says what it used, so a full-size read is counted toward the spending limit.
    if (mayHaveBeenBilled(error)) {
      const cost = unfinishedScreenshotCostUsd(SCREENSHOT_MODEL, maxTokens, pieces.length)
      await recordSpend(cost)
      options.onCost?.(cost)
    }
    throw error
  }
  // Counted toward the monthly spending limit whatever the outcome below.
  const cost = estimateCostUsd(SCREENSHOT_MODEL, response.usage)
  await recordSpend(cost)
  options.onCost?.(cost)

  if (response.stop_reason === "refusal") throw new ScreenshotError("This image couldn't be read. Try a screenshot of your account's transactions or positions.")
  if (response.stop_reason === "max_tokens") throw new ScreenshotError("That screenshot has more rows than can be read at once. Try a shorter one.")

  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("")
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ScreenshotError("The screenshot came back in an unexpected format. Please try again.")
  }
  return config.read(parsed) as ScreenshotResult<K>
}
