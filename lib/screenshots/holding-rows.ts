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
          price: {
            ...nullable("number"),
            description:
              "Price of one share or unit, if shown: an amount labelled Price, Last price or per share, or an unlabelled box beside the number of shares (a trading app's usual price box). Decided by the label, never the color.",
          },
          value: {
            ...nullable("number"),
            description:
              "Current total value of the whole position, if shown, including an amount labelled Equity, Value, Market value or Current value, in a box or not. Not the day's change, the gain, the cost basis or the price of one share; null when the row shows only shares and price.",
          },
          security_type: {
            ...nullable("string"),
            description:
              "What the screen calls it, on its row or in the heading of the section it's listed under (Stock, ETF, Mutual fund, Bond, Money market, Crypto). Null if neither says; never from what you know about it.",
          },
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
    // model has already said which rows these are, so they're labelled the same way here. Their
    // amounts are kept only for checkHoldingsAddUp: collectHoldings leaves both kinds out.
    if (kind === "total") rows.push({ symbol: "Total", name, quantity: null, price: null, value: number(row.value), securityType: "" })
    else if (kind === "pending") rows.push({ symbol: "Pending", name, quantity: null, price: null, value: number(row.value), securityType: "" })
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

export type AddUp =
  /** Nothing to check against: the screen shows no total. */
  | { status: "unchecked" }
  | { status: "adds-up" | "differs"; sum: number; total: number }

const isTotal = (row: HoldingRow) => row.symbol === "Total"
const isPending = (row: HoldingRow) => row.symbol === "Pending"

/** Rounding on screen (values to the cent, shares cut short) stays inside this; a misread digit or column doesn't. */
const agrees = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005)

/**
 * Whether a screenshot's rows add up to the total the screen itself shows: each row's value (or
 * shares times price), its shares times price matching its value, and no position left without
 * either. Code, not the model, so a read that took a share price for a position's value, left a
 * value out, or misread a digit shows up in the review (totalsThatDontAddUp) at no extra cost. A
 * total may or may not include pending activity, so either counts. A screenshot of part of a long
 * list under its account total differs too, so a difference is a reason to look, not proof of a
 * misread. The total is only ever compared: collectHoldings leaves it out.
 */
export function checkHoldingsAddUp(screenshot: HoldingsScreenshot): AddUp {
  const totals = screenshot.rows.filter((row) => isTotal(row) && row.value !== null && row.value > 0).map((row) => row.value as number)
  if (totals.length === 0) return { status: "unchecked" }
  let sum = 0
  let rowsAgree = true
  for (const row of screenshot.rows) {
    if (isTotal(row) || isPending(row)) continue
    const { quantity, price, value } = row
    if (value !== null && quantity !== null && price !== null && !agrees(quantity * price, value)) rowsAgree = false
    const amount = value ?? (quantity !== null && price !== null ? quantity * price : null)
    if (amount === null) rowsAgree = false
    else sum += amount
  }
  const pending = screenshot.rows.filter(isPending).reduce((total, row) => total + (row.value ?? 0), 0)
  // A screen can show more than one total (an account and the portfolio): the nearest is the one compared.
  const total = totals.reduce((best, candidate) => (Math.abs(sum - candidate) < Math.abs(sum - best) ? candidate : best))
  const addsUp = rowsAgree && totals.some((candidate) => agrees(sum, candidate) || agrees(sum + pending, candidate))
  return { status: addsUp ? "adds-up" : "differs", sum: Math.round(sum * 100) / 100, total }
}

const rowKey = (row: HoldingRow) => `${row.symbol.toUpperCase()}|${row.name.toLowerCase()}|${row.quantity}|${row.value}`

/**
 * The rows of several screenshots with any row seen again in a later one (a scrolled list) taken
 * once. A row is new only beyond the copies already seen, so two identical rows in one screenshot
 * stay two. `repeated` counts positions and cash seen again; a total shown on each is not one.
 */
function uniqueRows(screenshots: readonly HoldingsScreenshot[]): { rows: HoldingRow[]; repeated: number } {
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
        if (!isTotal(row) && !isPending(row)) repeated++
        continue
      }
      seen.set(key, (seen.get(key) ?? 0) + 1)
      rows.push(row)
    }
  }
  return { rows, repeated }
}

/** A screenshot whose rows don't add up to the total it shows: its place in the list, and that total. */
export type TotalMismatch = { index: number; total: number }

/**
 * The screenshots the review should warn about: each one that shows a total its rows don't add up
 * to (checkHoldingsAddUp). Several screenshots of one scrolled list are checked together first, so
 * a total at the top of the first isn't flagged when the rows of all of them add up to it. Only
 * tells; it never changes a value or blocks saving.
 */
export function totalsThatDontAddUp(screenshots: readonly HoldingsScreenshot[]): TotalMismatch[] {
  if (screenshots.length > 1 && checkHoldingsAddUp({ problem: "none", rows: uniqueRows(screenshots).rows }).status === "adds-up") return []
  return screenshots.flatMap((screenshot, index) => {
    const check = checkHoldingsAddUp(screenshot)
    return check.status === "differs" ? [{ index, total: check.total }] : []
  })
}

export type ScreenshotHoldings = CollectedHoldings & {
  /** Rows that showed again in a later screenshot (a scrolled list), counted once. */
  repeated: number
}

/**
 * One list from several screenshots. A row identical to one in an earlier screenshot is the same
 * position seen twice; the same fund with a different value is another account, and is added.
 */
export function holdingsFromScreenshots(screenshots: HoldingsScreenshot[]): ScreenshotHoldings {
  const { rows, repeated } = uniqueRows(screenshots)
  return { ...collectHoldings(rows), repeated }
}
