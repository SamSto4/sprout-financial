"use client"

import { useId, useState } from "react"
import { SearchIcon } from "lucide-react"

import { GLOSSARY } from "@/lib/learn/glossary"

export function Glossary() {
  const [query, setQuery] = useState("")
  const inputId = useId()
  const needle = query.trim().toLowerCase()
  const terms = needle
    ? GLOSSARY.filter(
        (item) =>
          item.term.toLowerCase().includes(needle) || item.definition.toLowerCase().includes(needle)
      )
    : GLOSSARY

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <label htmlFor={inputId} className="sr-only">
          Search the glossary
        </label>
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search terms, e.g. APR or inflation"
          className="h-11 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25"
        />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {needle ? `${terms.length} ${terms.length === 1 ? "term" : "terms"} found` : `${GLOSSARY.length} terms`}
      </p>

      {terms.length > 0 ? (
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {terms.map((item) => (
            <div key={item.term} className="border-t py-4">
              <dt className="font-semibold">{item.term}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{item.definition}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No matching terms</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different word, or ask the assistant to explain it.
          </p>
        </div>
      )}
    </div>
  )
}
