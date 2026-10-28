"use client"

import { useMemo, useState } from "react"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"
import { cn } from "cn"

import { ArtifactFrame, downloadCsv } from "@/components/artifacts/artifact-frame"
import type { TableArtifact as Table, TableColumn } from "@/lib/ai/artifacts"
import { formatMoneyPrecise, formatNumber, formatPercent } from "@/lib/format"

const PAGE = 25

function display(value: string | number | null, format: TableColumn["format"]) {
  if (value === null) return "—"
  if (typeof value === "string") return value
  if (format === "money") return formatMoneyPrecise(value)
  if (format === "percent") return formatPercent(value, Math.abs(value) < 0.1 ? 2 : 1)
  return formatNumber(value)
}

// A sortable table the agent added to a reply, with CSV download.
export function TableArtifact({ table }: { table: Table }) {
  const [sort, setSort] = useState<{ key: string; direction: "ascending" | "descending" } | null>(null)
  const [shown, setShown] = useState(PAGE)

  const rows = useMemo(() => {
    if (!sort) return table.rows
    const factor = sort.direction === "ascending" ? 1 : -1
    return [...table.rows].sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      if (x === null) return 1
      if (y === null) return -1
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * factor
    })
  }, [table.rows, sort])

  function sortBy(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
        : { key, direction: "ascending" }
    )
  }

  return (
    <ArtifactFrame
      title={table.title}
      source={table.source}
      onDownload={() =>
        downloadCsv(
          table.title,
          table.columns.map((column) => column.label),
          table.rows.map((row) => table.columns.map((column) => row[column.key]))
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="figures w-full text-sm">
          {table.title && <caption className="sr-only">{table.title}</caption>}
          <thead className="text-xs text-muted-foreground">
            <tr>
              {table.columns.map((column) => {
                const active = sort?.key === column.key
                const Icon = !active ? ArrowUpDownIcon : sort.direction === "ascending" ? ArrowUpIcon : ArrowDownIcon
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? sort.direction : "none"}
                    className={cn("border-b px-2.5 py-2 font-semibold", column.format === "text" ? "text-left" : "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                        column.format !== "text" && "flex-row-reverse"
                      )}
                    >
                      {column.label}
                      <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden="true" />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {table.columns.map((column) => (
                  <td key={column.key} className={cn("px-2.5 py-2", column.format === "text" ? "text-left" : "text-right")}>
                    {display(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown(rows.length)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          Show all {rows.length} rows
        </button>
      )}
    </ArtifactFrame>
  )
}
