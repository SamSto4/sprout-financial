// Artifacts are rich pieces the agent adds to a reply: interactive charts and data tables.
// They travel inside the reply text as fenced blocks (```chart / ```table with JSON), so they
// save, sync and reload with the chat like any other text, and the chat renders them.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { executeGraph } from "./graphs/executor.ts"
import type { GraphConfig } from "./graphs/graphtypes"

export type ArtifactKind = "chart" | "table"

export type TableColumn = { key: string; label: string; format: "money" | "percent" | "number" | "text" }

export type TableArtifact = {
  title?: string
  columns: TableColumn[]
  rows: Record<string, string | number | null>[]
  source?: string
}

export const MAX_TABLE_ROWS = 200
export const MAX_TABLE_COLUMNS = 8
const FORMATS: TableColumn["format"][] = ["money", "percent", "number", "text"]

export type TableResult = { ok: true; table: TableArtifact } | { ok: false; error: string }

/** Validates a table from the model. Errors are written for the model to correct. */
export function executeTable(input: unknown): TableResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "The table must be an object." }
  const raw = input as Record<string, unknown>

  if (!Array.isArray(raw.columns) || raw.columns.length === 0) return { ok: false, error: "columns must list at least one column." }
  const columns: TableColumn[] = []
  for (const column of raw.columns.slice(0, MAX_TABLE_COLUMNS)) {
    if (typeof column !== "object" || column === null) continue
    const { key, label, format } = column as Record<string, unknown>
    if (typeof key !== "string" || !/^[A-Za-z0-9_ -]{1,40}$/.test(key) || columns.some((c) => c.key === key)) continue
    columns.push({
      key,
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : key,
      format: FORMATS.includes(format as TableColumn["format"]) ? (format as TableColumn["format"]) : "text",
    })
  }
  if (columns.length === 0) return { ok: false, error: "Each column needs a key made of letters, numbers, _ or -." }

  if (!Array.isArray(raw.rows) || raw.rows.length === 0) return { ok: false, error: "rows must be a non-empty array." }
  if (raw.rows.length > MAX_TABLE_ROWS) return { ok: false, error: `rows can have at most ${MAX_TABLE_ROWS} entries.` }
  const rows: TableArtifact["rows"] = []
  for (const [index, row] of raw.rows.entries()) {
    if (typeof row !== "object" || row === null) return { ok: false, error: `rows[${index}] must be an object.` }
    const values = row as Record<string, unknown>
    const clean: TableArtifact["rows"][number] = {}
    for (const column of columns) {
      const value = values[column.key]
      if (value === undefined || value === null) clean[column.key] = null
      else if (typeof value === "number" && Number.isFinite(value)) clean[column.key] = value
      else if (typeof value === "string") clean[column.key] = value.slice(0, 200)
      else return { ok: false, error: `rows[${index}].${column.key} must be text, a number or null.` }
      if (column.format !== "text" && typeof clean[column.key] === "string") {
        return { ok: false, error: `rows[${index}].${column.key} must be a number (the column is ${column.format}).` }
      }
    }
    rows.push(clean)
  }

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : undefined
  const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim().slice(0, 200) : undefined
  return { ok: true, table: { ...(title ? { title } : {}), columns, rows, ...(source ? { source } : {}) } }
}

/** The fenced block that carries an artifact inside a reply. */
export function artifactBlock(kind: ArtifactKind, value: GraphConfig | TableArtifact) {
  return `\n\n\`\`\`${kind}\n${JSON.stringify(value)}\n\`\`\`\n\n`
}

/** Reads an artifact block's JSON back, re-validating it (stored chats are untrusted too). */
export function parseArtifact(kind: string, json: string): { kind: "chart"; graph: GraphConfig } | { kind: "table"; table: TableArtifact } | null {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (kind === "chart") {
    const createdAt = (raw as { metadata?: { createdAt?: unknown } })?.metadata?.createdAt
    const result = executeGraph(raw, typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : undefined)
    return result.ok ? { kind: "chart", graph: result.graph } : null
  }
  if (kind === "table") {
    const result = executeTable(raw)
    return result.ok ? { kind: "table", table: result.table } : null
  }
  return null
}

const ARTIFACT_BLOCK = /```(chart|table)\n([\s\S]*?)\n```/g

/** Describes one compacted block. `title` is the block's own title when it has one. */
export type ArtifactNote = (kind: ArtifactKind, title: string | undefined) => string

/** The note the model and past-chat search see in place of a block. */
const MODEL_NOTE: ArtifactNote = (kind, title) =>
  `[${kind === "chart" ? "Chart" : "Table"} shown to the user${title !== undefined ? `: ${title}` : ""}]`

/**
 * Replaces artifact blocks with a short note. Used before replies are sent back to the model or
 * searched as past chats, so large JSON doesn't cost tokens or get imitated, and (with its own
 * note) when a reply is copied or read aloud.
 */
export function compactArtifacts(text: string, note: ArtifactNote = MODEL_NOTE) {
  return text.replace(ARTIFACT_BLOCK, (_match, kind: ArtifactKind, json: string) => {
    let title: string | undefined
    try {
      const value = JSON.parse(json) as { title?: unknown }
      if (typeof value.title === "string") title = value.title
    } catch {
      // Unreadable block: describe it without a title.
    }
    return note(kind, title)
  })
}

/**
 * Text without control characters other than tab and newline. Cell text comes from the model, and
 * a spreadsheet that skips a leading control character would then read the formula after it.
 */
function withoutControlCharacters(text: string) {
  let kept = ""
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code === 9 || code === 10 || (code >= 32 && code !== 127)) kept += char
  }
  return kept
}

/** CSV for downloads. Quotes every field that needs it. */
export function toCsv(headers: string[], rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    if (value === null) return ""
    if (typeof value === "number") return String(value)
    // Text that starts like a formula gets a leading apostrophe so spreadsheets don't run it
    // (OWASP's CSV injection list: = + - @, tab and carriage return).
    const clean = withoutControlCharacters(value)
    const text = /^[=+\-@\t\r]/.test(clean) ? `'${clean}` : clean
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
}
