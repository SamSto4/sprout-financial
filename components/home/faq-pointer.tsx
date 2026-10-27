import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { homeFaqLinks } from "@/lib/faq"
import type { SiteFeatures } from "@/lib/site"

/**
 * The bottom-of-page pointer to /faq, on the home and About pages: a few questions that open their
 * answer, and a link to all of them. The FAQ is only linked from here and the footer (product decision).
 */
export function FaqPointer({ features }: { features: SiteFeatures }) {
  const links = homeFaqLinks(features)
  return (
    <section className="border-t" aria-labelledby="faq-pointer-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="space-y-2">
          <p className="eyebrow">Questions</p>
          <h2 id="faq-pointer-title" className="text-2xl font-semibold sm:text-3xl">
            Questions before you start?
          </h2>
          <p className="text-muted-foreground">Straight answers about what Sprout costs, your data, the AI and accounts.</p>
          <Link href="/faq" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary">
            See all questions
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {links.map((link) => (
            <li key={link.id}>
              <Link
                href={link.href}
                className="group flex h-full min-h-12 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:border-brand/50 hover:bg-surface"
              >
                {link.question}
                <ArrowRightIcon
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
