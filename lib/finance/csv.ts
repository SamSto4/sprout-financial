// Turns a bank or budgeting-app CSV export into a list of transactions.
// Exports differ a lot between banks, so columns are matched by their header names.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { MAX_CATEGORY_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_TRANSACTIONS, round2, type Transaction } from "./transactions.ts"

export const MAX_CSV_BYTES = 2 * 1024 * 1024

function detectDelimiter(text: string) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const counts = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }))
  counts.sort((a, b) => b.count - a.count)
  return counts[0].count > 0 ? counts[0].delimiter : ","
}

/** Splits CSV text into rows of fields. Handles quoted fields, doubled quotes and CRLF line endings. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "")
  const delimiter = detectDelimiter(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  const endRow = () => {
    row.push(field)
    field = ""
    if (row.some((cell) => cell.trim() !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === "") {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++
      endRow()
    } else {
      field += char
    }
  }
  endRow()
  return rows
}

/** Reads amounts like "-45.10", "$1,234.56", "(45.00)", "45.00-" and "1.234,56". */
export function parseAmount(raw: string): number | null {
  let text = raw.trim()
  if (!/\d/.test(text)) return null

  const negative = /^\(.*\)$/.test(text) || text.includes("-")
  text = text.replace(/[^\d.,]/g, "")

  const lastComma = text.lastIndexOf(",")
  const lastDot = text.lastIndexOf(".")
  if (lastComma !== -1 && lastDot !== -1) {
    // Both separators: whichever comes last is the decimal point.
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "")
  } else if (lastComma !== -1) {
    // "1,234" and "1,234,567" are thousands; "12,50" is a decimal comma.
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".")
  } else if ((text.match(/\./g) ?? []).length > 1) {
    text = text.replace(/\./g, "")
  }

  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return round2(negative ? -value : value)
}

export type DateOrder = "mdy" | "dmy"

/** Day-first files are recognised by a first number above 12 anywhere in the date column. */
export function detectDateOrder(values: string[]): DateOrder {
  for (const value of values) {
    const match = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/)
    if (match && Number(match[1]) > 12) return "dmy"
  }
  return "mdy"
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** Reads dates like 2026-03-05, 03/05/2026, 5/3/26, "Mar 5, 2026" and "5 Mar 2026" into YYYY-MM-DD. */
export function parseDate(raw: string, order: DateOrder = "mdy"): string | null {
  const text = raw.trim()

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]))

  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/)
  if (match) {
    const [first, second] = [Number(match[1]), Number(match[2])]
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    return order === "dmy" ? isoDate(year, second, first) : isoDate(year, first, second)
  }

  match = text.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i)
  if (match) {
    const month = MONTH_NAMES.indexOf(match[1].toLowerCase()) + 1
    return month ? isoDate(Number(match[3]), month, Number(match[2])) : null
  }

  match = text.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})/i)
  if (match) {
    const month = MONTH_NAMES.indexOf(match[2].toLowerCase()) + 1
    return month ? isoDate(Number(match[3]), month, Number(match[1])) : null
  }

  return null
}

type ColumnRole = "date" | "description" | "amount" | "debit" | "credit" | "category" | "type"

// Header names seen in common exports, most specific first.
const HEADER_NAMES: Record<ColumnRole, string[]> = {
  date: ["transaction date", "trans date", "date", "posted date", "posting date", "post date", "booking date", "value date"],
  description: ["description", "transaction description", "merchant", "merchant name", "payee", "name", "details", "narrative", "memo", "reference"],
  amount: ["amount", "transaction amount", "amount usd", "net amount", "value"],
  debit: ["debit", "debits", "debit amount", "withdrawal", "withdrawals", "money out", "paid out", "outflow"],
  credit: ["credit", "credits", "credit amount", "deposit", "deposits", "money in", "paid in", "inflow"],
  category: ["category", "categories", "budget category", "spending category"],
  type: ["type", "transaction type", "debit credit", "dr cr", "credit debit indicator"],
}

// Loose matches used when no exact header name is found.
const HEADER_WORDS: Partial<Record<ColumnRole, string>> = {
  date: "date",
  description: "description",
  amount: "amount",
  category: "category",
}

export type ColumnMap = Partial<Record<ColumnRole, number>>

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Matches header cells to column roles. Returns null unless date, description and an amount are found. */
export function detectColumns(headers: string[]): ColumnMap | null {
  const normalized = headers.map(normalizeHeader)
  const used = new Set<number>()
  const columns: ColumnMap = {}

  const claim = (role: ColumnRole, index: number) => {
    columns[role] = index
    used.add(index)
  }

  // Debit/credit first so a "Debit Amount" column isn't taken as the single amount column.
  for (const role of ["date", "debit", "credit", "amount", "description", "category", "type"] as ColumnRole[]) {
    for (const name of HEADER_NAMES[role]) {
      const index = normalized.findIndex((header, i) => header === name && !used.has(i))
      if (index !== -1) {
        claim(role, index)
        break
      }
    }
  }
  for (const [role, word] of Object.entries(HEADER_WORDS) as [ColumnRole, string][]) {
    if (columns[role] !== undefined) continue
    const index = normalized.findIndex((header, i) => header.includes(word) && !used.has(i))
    if (index !== -1) claim(role, index)
  }

  const hasAmount = columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined
  if (columns.date === undefined || columns.description === undefined || !hasAmount) return null
  return columns
}

// A type column marks money out on files where every amount is positive.
const DEBIT_TYPE = /^(debit|dr|withdrawal|purchase|sale|fee|charge)/i

export type CsvImport =
  | {
      ok: true
      transactions: Transaction[]
      /** The header names that were used, so the user can check them. */
      columns: { date: string; description: string; amount: string; category?: string }
      skippedRows: number
      /** True when the file had more than MAX_TRANSACTIONS rows and only the most recent were kept. */
      truncated: boolean
    }
  | { ok: false; error: string }

export function importTransactionsFromCsv(text: string, options: { flipSigns?: boolean } = {}): CsvImport {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { ok: false, error: "That file doesn't have any transaction rows." }
  }

  // Some banks put account details above the header row, so look a few rows down.
  let headerIndex = -1
  let columns: ColumnMap | null = null
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    columns = detectColumns(rows[i])
    if (columns) {
      headerIndex = i
      break
    }
  }
  if (!columns) {
    return {
      ok: false,
      error:
        "Couldn't find the columns. The file needs a header row with a date, a description and an amount (or debit and credit) column.",
    }
  }

  const header = rows[headerIndex]
  const dataRows = rows.slice(headerIndex + 1)
  const cell = (row: string[], index: number | undefined) => (index === undefined ? "" : (row[index] ?? "").trim())
  const order = detectDateOrder(dataRows.map((row) => cell(row, columns.date)))

  type Parsed = Transaction & { type: string }
  const parsed: Parsed[] = []
  let skippedRows = 0

  for (const row of dataRows) {
    const date = parseDate(cell(row, columns.date), order)
    let amount: number | null
    if (columns.amount !== undefined) {
      amount = parseAmount(cell(row, columns.amount))
    } else {
      const debit = parseAmount(cell(row, columns.debit))
      const credit = parseAmount(cell(row, columns.credit))
      amount = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
    }
    if (!date || amount === null) {
      skippedRows += 1
      continue
    }

    const category = cell(row, columns.category).replace(/\s+/g, " ").slice(0, MAX_CATEGORY_LENGTH)
    parsed.push({
      date,
      description:
        cell(row, columns.description).replace(/\s+/g, " ").slice(0, MAX_DESCRIPTION_LENGTH) || "(no description)",
      amount: round2(amount),
      ...(category ? { category } : {}),
      type: cell(row, columns.type),
    })
  }

  if (parsed.length === 0) {
    return { ok: false, error: "Couldn't read any dates and amounts from that file." }
  }

  // Unsigned files mark money out in a type column instead of with a minus sign.
  const unsigned = columns.type !== undefined && parsed.every((t) => t.amount >= 0)

  const transactions = parsed
    .map(({ type, ...transaction }) => {
      let amount = unsigned && DEBIT_TYPE.test(type) ? -transaction.amount : transaction.amount
      if (options.flipSigns) amount = -amount
      return { ...transaction, amount: amount === 0 ? 0 : amount }
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    ok: true,
    transactions: transactions.slice(0, MAX_TRANSACTIONS),
    columns: {
      date: header[columns.date!],
      description: header[columns.description!],
      amount:
        columns.amount !== undefined
          ? header[columns.amount]
          : [columns.credit, columns.debit]
              .filter((index) => index !== undefined)
              .map((index) => header[index!])
              .join(" / "),
      ...(columns.category !== undefined ? { category: header[columns.category] } : {}),
    },
    skippedRows,
    truncated: transactions.length > MAX_TRANSACTIONS,
  }
}
