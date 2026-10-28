import Link from "next/link"

import { BrandMark } from "@/components/brand-mark"
import { GrowthLine } from "@/components/growth-line"
import { FOOTER_LINKS, SITE_NAME, SITE_TAGLINE } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-3">
            <p className="flex items-center gap-2 font-heading text-lg font-semibold">
              <BrandMark className="size-6" />
              {SITE_NAME}
            </p>
            <p className="text-sm text-muted-foreground">{SITE_TAGLINE}.</p>
            <GrowthLine className="h-8 w-40" />
          </div>
          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-12 gap-y-1 text-sm sm:grid-cols-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="-mx-2 flex min-h-10 items-center rounded-md px-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-10 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          Educational information, not financial advice. For big legal, tax or investment decisions, talk to a
          qualified professional.
        </p>
      </div>
    </footer>
  )
}
