import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import { CALCULATOR_TOOLS as CALCULATORS, runCalculator } from "@/lib/ai/calculators"
import { searchPastChats } from "@/lib/chat/history"
import type { ChatContext } from "@/lib/chat/validate"
import { analyzeSpending } from "@/lib/finance/insights"
import { findTransactions, parseTransactionFilter, summarizeTransactions } from "@/lib/finance/transactions"
import { getCompanyProfile, getQuote, MarketDataError, searchCompanies } from "@/lib/market/fmp"
import { parseSearchQuery, parseSymbol } from "@/lib/market/inputs"

type Tool = Anthropic.Beta.Messages.BetaTool

// Always offered: projections, fee drag, doubling time and budget checks come from tested code.
export const CALCULATOR_TOOLS: Tool[] = CALCULATORS

export const MARKET_TOOLS: Tool[] = [
  {
    name: "search_companies",
    description:
      "Find stock ticker symbols by company name, e.g. 'Apple' -> AAPL. Use this when the user names a company but you aren't sure of its exact ticker.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name to search for, e.g. 'Microsoft'." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_stock_quote",
    description:
      "Get the latest market quote for one stock, ETF or index: price, daily change, day and 52-week range, volume, market cap and 50/200-day averages. Prices may be delayed. Use this whenever the user asks about a current price or recent performance.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, e.g. 'AAPL', 'VOO', '^GSPC'." },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_company_profile",
    description:
      "Get background on a company or fund: what it does, sector, industry, country, market cap, beta (volatility vs. the market), last dividend and whether it's an ETF or fund.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker symbol, e.g. 'AAPL'." },
      },
      required: ["symbol"],
    },
  },
]

// Offered only when the browser sent saved chats with the question.
export const MEMORY_TOOLS: Tool[] = [
  {
    name: "search_past_chats",
    description:
      "Search the user's earlier conversations, saved in their browser, by keywords. Returns matching excerpts with the chat id, title and date. Use this when the user refers to something discussed before, or when details they may have shared earlier (income, goals, debts, country, risk tolerance) would help.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords to look for, e.g. 'emergency fund goal' or 'credit card APR'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_past_chat",
    description:
      "Read one earlier conversation in order. Long messages are shortened. Use a chat id from the list of saved chats or from search_past_chats.",
    input_schema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "The id of the saved chat." },
      },
      required: ["chat_id"],
    },
  },
]

// Offered only when the browser sent imported transactions with the question.
export const FINANCE_TOOLS: Tool[] = [
  {
    name: "get_finance_summary",
    description:
      "Summarize the transactions the user imported from a CSV file: date range, total and monthly-average income, spending and net, savings rate, spending by month, top categories and payees, regular payments (bills and subscriptions), largest expenses, likely transfers between accounts, and caveats about the data. All figures are pre-calculated; quote them rather than recalculating.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_spending_trends",
    description:
      "Compare the user's full months of spending: total change from the first to the latest full month, the categories (or payees) that changed most in the latest month versus earlier ones, fixed same-amount payments with their yearly cost, small frequent purchases that add up, and the highest-spending month. Partial first and last months are excluded. Use this for questions about trends, changes, or where to cut back.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_transactions",
    description:
      "List the user's imported transactions that match a filter, newest first, with the number of matches and their net total. Spending is negative, income positive. All filters are optional and combine.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to find in the description, e.g. 'netflix'." },
        category: { type: "string", description: "Exact category name from the summary." },
        month: { type: "string", description: "Calendar month as YYYY-MM." },
        kind: { type: "string", enum: ["income", "spending"] },
        limit: { type: "integer", description: "How many to list, 1 to 50. Defaults to 25." },
      },
    },
  },
]

type ToolOutcome = { content: string; isError: boolean }

/** Runs one tool call from the model. Inputs are model output, so they're validated first. */
export async function runTool(name: string, input: unknown, context: ChatContext): Promise<ToolOutcome> {
  try {
    const calculated = runCalculator(name, input)
    if (calculated) return calculated

    switch (name) {
      case "search_past_chats": {
        const { query } = (input ?? {}) as { query?: unknown }
        if (typeof query !== "string" || !query.trim() || query.length > 200) {
          return invalid("query must be a few keywords, up to 200 characters.")
        }
        const matches = searchPastChats(context.pastChats, query)
        return ok(matches.length > 0 ? matches : { matches: [], note: "No saved chat mentions those words." })
      }
      case "read_past_chat": {
        const { chat_id: chatId } = (input ?? {}) as { chat_id?: unknown }
        const chat = context.pastChats.find((past) => past.id === chatId)
        if (!chat) return invalid("chat_id must be the id of one of the saved chats.")
        return ok(chat)
      }
      case "get_finance_summary": {
        const summary = summarizeTransactions(context.transactions)
        return summary ? ok(summary) : { content: "No transactions have been imported.", isError: true }
      }
      case "get_spending_trends": {
        const trends = analyzeSpending(context.transactions)
        return trends ? ok(trends) : { content: "No transactions have been imported.", isError: true }
      }
      case "find_transactions": {
        const filter = parseTransactionFilter(input)
        if (!filter) return invalid("check the filters: month is YYYY-MM, kind is income or spending, limit is 1-50.")
        return ok(findTransactions(context.transactions, filter))
      }
      case "search_companies": {
        const query = parseSearchQuery(input)
        if (!query) return invalid("query must be a company name (letters, numbers, up to 60 characters).")
        return ok(await searchCompanies(query))
      }
      case "get_stock_quote": {
        const symbol = parseSymbol(input)
        if (!symbol) return invalid("symbol must be a ticker like AAPL or BRK.B.")
        return ok(await getQuote(symbol))
      }
      case "get_company_profile": {
        const symbol = parseSymbol(input)
        if (!symbol) return invalid("symbol must be a ticker like AAPL or BRK.B.")
        return ok(await getCompanyProfile(symbol))
      }
      default:
        return invalid(`Unknown tool: ${name}`)
    }
  } catch (error) {
    if (error instanceof MarketDataError) return { content: error.message, isError: true }
    console.error(`Tool ${name} failed:`, error)
    return { content: "The data lookup failed unexpectedly.", isError: true }
  }
}

function ok(data: unknown): ToolOutcome {
  return { content: JSON.stringify(data), isError: false }
}

function invalid(message: string): ToolOutcome {
  return { content: `Invalid input: ${message}`, isError: true }
}
