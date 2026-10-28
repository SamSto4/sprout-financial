"use client"

import type { ReactNode } from "react"
import { DownloadIcon } from "lucide-react"

import { toCsv } from "@/lib/ai/artifacts"

function fileName(title: string | undefined) {
  const slug = (title ?? "data")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "data"}.csv`
}

/** Saves rows as a CSV file in the browser. */
export function downloadCsv(title: string | undefined, headers: string[], rows: (string | number | null)[][]) {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName(title)
  link.click()
  URL.revokeObjectURL(url)
}

/** The small header actions on a chart or table (Table/Chart, CSV): quiet until hovered or focused. */
export const ARTIFACT_ACTION =
  "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-primary transition-colors duration-(--duration-fast) hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-secondary"

/** Shared card around charts and tables in a reply: title, actions, body and source. */
export function ArtifactFrame({
  title,
  description,
  source,
  actions,
  onDownload,
  children,
}: {
  title?: string
  description?: string
  source?: string
  actions?: ReactNode
  onDownload: () => void
  children: ReactNode
}) {
  return (
    <figure className="not-prose my-5 overflow-hidden rounded-xl border bg-background shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 border-b bg-surface/70 px-4 py-3">
        <div className="min-w-0">
          {title && <figcaption className="text-sm leading-snug font-semibold">{title}</figcaption>}
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="-my-1 -mr-1.5 flex items-center gap-0.5">
          {actions}
          <button
            type="button"
            onClick={onDownload}
            className={ARTIFACT_ACTION}
          >
            <DownloadIcon className="size-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
      {source && <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">Source: {source}</p>}
    </figure>
  )
}
