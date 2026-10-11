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
    <figure className="not-prose my-4 overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-surface px-3.5 py-2.5">
        <div className="min-w-0">
          {title && <figcaption className="text-sm font-semibold">{title}</figcaption>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-secondary"
          >
            <DownloadIcon className="size-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>
      </div>
      <div className="p-3">{children}</div>
      {source && <p className="border-t px-3.5 py-2 text-[11px] text-muted-foreground">Source: {source}</p>}
    </figure>
  )
}
