"use client"

import { useState } from "react"

import type { HoldingsScreenshot } from "@/lib/screenshots/holding-rows"
import { MAX_SCREENSHOTS, type ScreenshotKind } from "@/lib/screenshots/image"
import { prepareScreenshot, PrepareError } from "@/lib/screenshots/prepare-image"
import type { TransactionScreenshot } from "@/lib/screenshots/transaction-rows"

type Result<K extends ScreenshotKind> = K extends "transactions" ? TransactionScreenshot : HoldingsScreenshot

/** One picked image: its result, or why it couldn't be read. `label` names it in messages. */
export type ScreenshotRead<K extends ScreenshotKind> = { label: string } & ({ ok: true; result: Result<K> } | { ok: false; error: string })

// Two at a time: quicker than one by one, without bursting through the per-visitor rate limit.
const CONCURRENCY = 2

async function readOne<K extends ScreenshotKind>(kind: K, file: File): Promise<Result<K>> {
  // One image, or the pieces of a tall capture: either way one request and one result.
  const images = await prepareScreenshot(file)
  const response = await fetch("/api/import/screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, images }),
  })
  const body = (await response.json().catch(() => null)) as { result?: Result<K>; error?: string } | null
  if (!response.ok || !body?.result) throw new PrepareError(body?.error ?? "Couldn't read that screenshot. Please try again.")
  return body.result
}

/**
 * Sends picked screenshots to be read, a couple at a time, and reports progress. The images go
 * to the server only for reading; nothing is saved until the person confirms the review.
 */
export function useScreenshotReader<K extends ScreenshotKind>(kind: K) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  async function read(picked: File[]): Promise<{ reads: ScreenshotRead<K>[]; tooMany: number }> {
    const files = picked.slice(0, MAX_SCREENSHOTS)
    const reads: ScreenshotRead<K>[] = new Array(files.length)
    const label = (index: number) => (files.length === 1 ? "This screenshot" : `Screenshot ${index + 1}`)
    let next = 0
    let done = 0
    setProgress({ done: 0, total: files.length })
    try {
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
          while (next < files.length) {
            const index = next++
            try {
              reads[index] = { label: label(index), ok: true, result: await readOne(kind, files[index]) }
            } catch (error) {
              const message = error instanceof PrepareError ? error.message : "Couldn't reach Sprout. Check your connection and try again."
              reads[index] = { label: label(index), ok: false, error: message }
            }
            setProgress({ done: ++done, total: files.length })
          }
        })
      )
    } finally {
      setProgress(null)
    }
    return { reads, tooMany: picked.length - files.length }
  }

  return { read, progress }
}
