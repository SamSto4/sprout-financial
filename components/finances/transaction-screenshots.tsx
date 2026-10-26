"use client"

import { useState } from "react"

import { TransactionScreenshotReview } from "@/components/finances/transaction-screenshot-review"
import { useScreenshotReader } from "@/components/screenshots/use-screenshot-reader"
import { MAX_SCREENSHOTS, problemMessage } from "@/lib/screenshots/image"
import { addTransactions, buildTransactionReview, type ReviewTransaction } from "@/lib/screenshots/transaction-rows"
import { financesStore } from "@/lib/stores"

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Screenshot import for the Dashboard: `pick` reads the chosen screenshots, and `panel` is the
 * review to show (full width) until the person adds the rows or cancels. Rows are added to what's
 * already imported, so a CSV from one bank and screenshots from another end up together.
 */
export function useTransactionScreenshots(onAdded?: () => void) {
  const { read, progress } = useScreenshotReader("transactions")
  const [review, setReview] = useState<{ rows: ReviewTransaction[]; notes: string[]; key: number } | null>(null)

  async function pick(files: File[]) {
    setReview(null)
    const { reads, tooMany } = await read(files)
    const existing = financesStore.get()?.transactions ?? []
    const results = reads.flatMap((item) => (item.ok ? [item.result] : []))
    const built = buildTransactionReview(results, existing, localToday())

    const notes: string[] = []
    for (const item of reads) {
      if (!item.ok) notes.push(`${item.label}: ${item.error}`)
      else if (item.result.transactions.length === 0 && item.result.pending === 0) notes.push(problemMessage("transactions", item.result.problem, item.label))
    }
    if (tooMany > 0) notes.push(`Only the first ${MAX_SCREENSHOTS} screenshots were read. Add the rest next.`)
    if (built.duplicates > 0) notes.push(`${count(built.duplicates, "transaction was", "transactions were")} already in your list or in another screenshot, so left out.`)
    if (built.pending > 0) notes.push(`${count(built.pending, "pending transaction was", "pending transactions were")} left out. Add ${built.pending === 1 ? "it" : "them"} once posted.`)
    if (built.skipped > 0) notes.push(`${count(built.skipped, "row", "rows")} couldn't be read in full and ${built.skipped === 1 ? "was" : "were"} left out.`)
    if (built.rows.some((row) => row.yearAssumed)) {
      notes.push(`${reads.length === 1 ? "The screenshot doesn't" : "Some screenshots don't"} show the year, so dates use the most recent one. Fix any that look wrong.`)
    }
    setReview({ rows: built.rows, notes, key: Date.now() })
  }

  const panel = review && (
    <TransactionScreenshotReview
      key={review.key}
      rows={review.rows}
      notes={review.notes}
      onCancel={() => setReview(null)}
      onConfirm={(transactions) => {
        // Read again, in case the saved data changed while the review was open.
        financesStore.set(addTransactions(financesStore.get(), transactions, new Date().toISOString()))
        setReview(null)
        onAdded?.()
      }}
    />
  )

  return { pick, progress, panel }
}
