import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { cn } from "cn"

import { ARROW_LINK } from "@/components/home/section-intro"
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
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
        <div>
          <p className="eyebrow">Questions</p>
          <h2 id="faq-pointer-title" className="display mt-3 text-[1.75rem] sm:text-3xl">
            Questions before you start?
          </h2>
          <p className="mt-3 text-muted-foreground">Straight answers about what Sprout costs, your data, the AI and accounts.</p>
          <Link href="/faq" className={cn(ARROW_LINK, "mt-2")}>
            See all questions
            <ArrowRightIcon
              className="size-4 transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {links.map((link) => (
            <li key={link.id}>
              <Link
                href={link.href}
                className="group flex min-h-14 items-center justify-between gap-3 px-5 py-3.5 text-[0.9375rem] font-medium transition-colors duration-(--duration-fast) hover:bg-surface focus-visible:-outline-offset-2"
              >
                {link.question}
                <ArrowRightIcon
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) ease-out group-hover:translate-x-0.5 group-hover:text-primary"
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
