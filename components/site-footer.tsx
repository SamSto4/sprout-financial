import Link from "next/link"

import { BrandMark } from "@/components/brand-mark"
import { FOOTER_LINKS, SITE_NAME } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-3">
          <p className="flex items-center gap-2 font-heading text-base font-semibold">
            <BrandMark className="size-5" />
            {SITE_NAME}
          </p>
          <p className="text-sm text-muted-foreground">
            Educational information, not financial advice. For big legal, tax or investment
            decisions, talk to a qualified professional.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground hover:text-foreground">
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  )
}
