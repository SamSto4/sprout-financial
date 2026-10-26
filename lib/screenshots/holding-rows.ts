// Holdings read from a screenshot of a brokerage or retirement account: the JSON shape Claude must
// return, the checks on what comes back, and how several screenshots become one list. The rules
// for totals, cash, asset classes and combining are the CSV import's (collectHoldings), so a
// screenshot and a file of the same account give the same holdings. Pure and tested.

import { collectHoldings, type CollectedHoldings, type HoldingRow } from "../portfolio/csv-import.ts"
import { SCREENSHOT_PROBLEMS, type ScreenshotProblem } from "./image.ts"
import { maskAccountNumbers, MAX_ROWS_PER_SCREENSHOT } from "./transaction-rows.ts"

const ROW_KINDS = ["position", "cash", "total", "pending"] as const
const nullable = (type: "number" | "string") => ({ anyOf: [{ type }, { type: "null" }] })

/** JSON schema for structured output. There is no field for an account number, so none comes back. */
export const HOLDINGS_SCREENSHOT_SCHEMA = {
  type: "object",
  properties: {
    problem: {
      type: "string",
      enum: [...SCREENSHOT_PROBLEMS],
      description:
        "none: it shows investment holdings or positions. not_financial: it isn't a brokerage, retirement or bank screen. wrong_kind: it's financial but shows transactions or activity, not holdings. unreadable: too blurry, small or cut off to read.",
    },
    holdings: {
      type: "array",
      description: "Every row visible, top to bottom, including cash, totals and pending lines. Empty when problem isn't none.",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [...ROW_KINDS],
            description: "position: an investment. cash: cash, a sweep or a money market position. total: an account or portfolio total. pending: pending activity.",
          },
          symbol: { ...nullable("string"), description: "The ticker exactly as shown, e.g. VTI or BRK.B; null if none is shown. Never guess one from the name." },
          name: { type: "string", description: "The investment's name as shown, or an empty string." },
          shares: { ...nullable("number"), description: "Quantity or shares held, if shown." },
          price: { ...nullable("number"), description: "Price per share, if shown." },
          value: { ...nullable("number"), description: "Current total value of the position, if shown. Not the day's change or the gain." },
          security_type: { ...nullable("string"), description: "What the screen says it is (Stock, ETF, Mutual fund, Bond, Money market), if it says." },
        },
        required: ["kind", "symbol", "name", "shares", "price", "value", "security_type"],
        additionalProperties: false,
      },
    },
  },
  required: ["problem", "holdings"],
  additionalProperties: false,
}

export type HoldingsScreenshot = { problem: ScreenshotProblem; rows: HoldingRow[] }

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
const text = (value: unknown, maxLength: number) =>
  typeof value === "string" ? maskAccountNumbers(value.replace(/\s+/g, " ").trim()).slice(0, maxLength) : ""

/** Checks the model's answer for one screenshot. Never throws; anything malformed is dropped. */
export function readHoldingsScreenshot(raw: unknown): HoldingsScreenshot {
  if (typeof raw !== "object" || raw === null) return { problem: "unreadable", rows: [] }
  const { problem, holdings } = raw as Record<string, unknown>
  const rows: HoldingRow[] = []
  for (const item of Array.isArray(holdings) ? holdings.slice(0, MAX_ROWS_PER_SCREENSHOT) : []) {
    const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>
    const kind = (ROW_KINDS as readonly unknown[]).includes(row.kind) ? (row.kind as (typeof ROW_KINDS)[number]) : "position"
    const name = text(row.name, 80)
    const symbol = text(row.symbol, 16)
    // collectHoldings recognizes totals, pending lines and cash by how files label them; the
    // model has already said which rows these are, so they're labelled the same way here.
    if (kind === "total") rows.push({ symbol: "Total", name, quantity: null, price: null, value: null, securityType: "" })
    else if (kind === "pending") rows.push({ symbol: "Pending", name, quantity: null, price: null, value: null, securityType: "" })
    else {
      rows.push({
        symbol: kind === "cash" && !symbol ? "Cash" : symbol,
        name,
        quantity: number(row.shares),
        price: number(row.price),
        value: number(row.value),
        securityType: kind === "cash" ? "Money market" : text(row.security_type, 40),
      })
    }
  }
  const valid = (SCREENSHOT_PROBLEMS as readonly unknown[]).includes(problem) ? (problem as ScreenshotProblem) : "unreadable"
  return { problem: rows.some((row) => row.symbol !== "Total" && row.symbol !== "Pending") ? "none" : valid, rows }
}

const rowKey = (row: HoldingRow) => `${row.symbol.toUpperCase()}|${row.name.toLowerCase()}|${row.quantity}|${row.value}`

export type ScreenshotHoldings = CollectedHoldings & {
  /** Rows that showed again in a later screenshot (a scrolled list), counted once. */
  repeated: number
}

/**
 * One list from several screenshots. A row identical to one in an earlier screenshot is the same
 * position seen twice; the same fund with a different value is another account, and is added.
 */
export function holdingsFromScreenshots(screenshots: HoldingsScreenshot[]): ScreenshotHoldings {
  const seen = new Map<string, number>()
  const rows: HoldingRow[] = []
  let repeated = 0
  for (const screenshot of screenshots) {
    const available = new Map(seen)
    for (const row of screenshot.rows) {
      const key = rowKey(row)
      const left = available.get(key) ?? 0
      if (left > 0) {
        available.set(key, left - 1)
        repeated++
        continue
      }
      seen.set(key, (seen.get(key) ?? 0) + 1)
      rows.push(row)
    }
  }
  return { ...collectHoldings(rows), repeated }
}
