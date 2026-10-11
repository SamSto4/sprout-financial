"use client"

import { useId, useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { findTransactions, type Transaction } from "@/lib/finance/transactions"
import { formatMoney } from "@/lib/format"
import { formatMonth } from "@/components/finances/monthly-chart"

const PAGE_SIZE = 25
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

type Kind = "all" | "income" | "spending"
type Sort = "newest" | "largest"

const selectClass =
  "h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"

export function TransactionExplorer({ transactions, months }: { transactions: Transaction[]; months: string[] }) {
  const [query, setQuery] = useState("")
  const [month, setMonth] = useState("")
  const [category, setCategory] = useState("")
  const [kind, setKind] = useState<Kind>("all")
  const [sort, setSort] = useState<Sort>("newest")
  const [shown, setShown] = useState(PAGE_SIZE)
  const id = useId()

  const categories = useMemo(
    () => [...new Set(transactions.map((transaction) => transaction.category).filter(Boolean) as string[])].sort(),
    [transactions]
  )

  const result = useMemo(() => {
    const found = findTransactions(transactions, {
      query: query.trim() || undefined,
      month: month || undefined,
      category: category || undefined,
      kind: kind === "all" ? undefined : kind,
      limit: transactions.length,
    })
    const rows =
      sort === "largest"
        ? [...found.transactions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        : found.transactions
    return { ...found, rows }
  }, [transactions, query, month, category, kind, sort])

  // Any filter change starts the list from the top again.
  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setShown(PAGE_SIZE)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <label htmlFor={`${id}-q`} className="sr-only">
            Search descriptions
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(event) => update(setQuery)(event.target.value)}
            placeholder="Search descriptions"
            className="h-9 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
          />
        </div>
        <label className="sr-only" htmlFor={`${id}-month`}>Month</label>
        <select id={`${id}-month`} value={month} onChange={(event) => update(setMonth)(event.target.value)} className={selectClass}>
          <option value="">All months</option>
          {months.map((value) => (
            <option key={value} value={value}>
              {formatMonth(value)}
            </option>
          ))}
        </select>
        {categories.length > 0 && (
          <>
            <label className="sr-only" htmlFor={`${id}-cat`}>Category</label>
            <select id={`${id}-cat`} value={category} onChange={(event) => update(setCategory)(event.target.value)} className={selectClass}>
              <option value="">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="sr-only" htmlFor={`${id}-sort`}>Sort</label>
        <select id={`${id}-sort`} value={sort} onChange={(event) => update(setSort)(event.target.value as Sort)} className={selectClass}>
          <option value="newest">Newest first</option>
          <option value="largest">Largest first</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg bg-muted p-1">
          {(["all", "income", "spending"] as Kind[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => update(setKind)(value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                kind === value ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "all" ? "All" : value === "income" ? "Money in" : "Money out"}
            </button>
          ))}
        </div>
        <p className="figures text-sm text-muted-foreground" aria-live="polite">
          {result.matched.toLocaleString()} {result.matched === 1 ? "transaction" : "transactions"} · net{" "}
          <span className={result.netTotal < 0 ? "text-foreground" : "text-primary"}>{formatMoney(result.netTotal)}</span>
        </p>
      </div>

      {result.matched === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No transactions match those filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="figures w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Imported transactions</caption>
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Date</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Description</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Category</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, shown).map((transaction, index) => (
                <tr key={`${transaction.date}-${index}`} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {dayFormat.format(new Date(`${transaction.date}T00:00:00Z`))}
                  </td>
                  <td className="max-w-64 truncate px-3 py-2 font-medium" title={transaction.description}>
                    {transaction.description}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{transaction.category ?? "—"}</td>
                  <td className={cn("px-3 py-2 text-right font-medium whitespace-nowrap", transaction.amount >= 0 && "text-primary")}>
                    {transaction.amount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(transaction.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.rows.length > shown && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setShown((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, result.rows.length - shown)} more
          </Button>
        </div>
      )}
    </div>
  )
}
