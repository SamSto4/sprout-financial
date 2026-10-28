import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"

import { GrowthLine } from "@/components/growth-line"
import { Button } from "@/components/ui/button"

/** The closing call to action: a dark-green panel, the one strong block of colour on the page. */
export function ClosingPanel({
  titleId,
  title,
  body,
  primary,
  secondary,
}: {
  titleId: string
  title: string
  body: string
  primary: { href: string; label: string }
  secondary: { href: string; label: string }
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground shadow-lg sm:px-12 sm:py-16 lg:px-16">
      <GrowthLine className="pointer-events-none absolute right-10 bottom-10 hidden h-40 w-[min(30rem,50%)] text-white/25 sm:block lg:h-48" />
      <div className="relative max-w-xl">
        <h2 id={titleId} className="display text-4xl sm:text-5xl">
          {title}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-white/85">{body}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            render={<Link href={primary.href} />}
            nativeButton={false}
            size="lg"
            className="bg-white text-primary hover:bg-secondary focus-visible:ring-white/60"
          >
            {primary.label}
            <ArrowRightIcon />
          </Button>
          <Button
            render={<Link href={secondary.href} />}
            nativeButton={false}
            variant="outline"
            size="lg"
            className="border-white/35 bg-transparent text-white shadow-none hover:border-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-white/60"
          >
            {secondary.label}
          </Button>
        </div>
      </div>
    </div>
  )
}
