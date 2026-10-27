import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRightIcon, LinkIcon, PlusIcon } from "lucide-react"

import { FaqAnswer } from "@/components/faq/faq-answer"
import { OpenLinkedQuestion } from "@/components/faq/open-linked-question"
import { JsonLd } from "@/components/json-ld"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { viewerEmail } from "@/lib/auth/session"
import { faqAnswerText, faqGroups } from "@/lib/faq"
import { faqPageJsonLd } from "@/lib/seo/json-ld"
import { pageMetadata } from "@/lib/seo/metadata"
import { PUBLIC_PAGES } from "@/lib/seo/pages"
import { siteFeatures } from "@/lib/site-features"
import { siteUrl } from "@/lib/site-url"

// Title, description and canonical link (lib/seo/pages.ts).
export const metadata: Metadata = pageMetadata(PUBLIC_PAGES.faq)

// Linked only from the footer and the bottom of the home and About pages, not the header (product decision).
export default async function FaqPage() {
  const features = siteFeatures()
  const groups = faqGroups(features)
  const showSignup = features.accounts && !(await viewerEmail())

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <OpenLinkedQuestion />
      {/* FAQPage structured data, built from the same `groups` as the page, so it always matches what this server shows. */}
      <JsonLd
        data={faqPageJsonLd(
          siteUrl(process.env),
          groups.flatMap((group) => group.items).map((item) => ({ question: item.question, answer: faqAnswerText(item) }))
        )}
      />
      <PageHeader eyebrow="Help" title="Frequently asked questions" description="Straight answers about Sprout, your data and the AI assistant." />

      <nav aria-label="FAQ topics" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <li key={group.id}>
              <a
                href={`#${group.id}`}
                className="inline-flex min-h-10 items-center rounded-full border bg-card px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
              >
                {group.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.id} className="mt-12">
          <h2 id={group.id} className="scroll-mt-24 text-2xl font-semibold">
            {group.title}
          </h2>
          <div className="mt-4 divide-y rounded-xl border bg-card">
            {group.items.map((item) => (
              <details key={item.id} id={item.id} className="group scroll-mt-24 px-5">
                {/* No heading inside <summary>: some screen readers drop its role there. */}
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 font-medium transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <PlusIcon
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  />
                </summary>
                <div className="space-y-3 pb-5 text-[0.9375rem] leading-relaxed">
                  <FaqAnswer blocks={item.answer} />
                  <a
                    href={`#${item.id}`}
                    className="inline-flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <LinkIcon className="size-3" aria-hidden="true" />
                    Link to this answer<span className="sr-only">: {item.question}</span>
                  </a>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="faq-next-title" className="mt-16 rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 id="faq-next-title" className="text-2xl font-semibold">
          Ready to try it?
        </h2>
        <p className="mt-2 text-muted-foreground">
          {showSignup
            ? "Everything works without an account. Create one when you want your progress on every device."
            : "Pick a lesson, build your plan or ask the assistant a question."}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button render={<Link href={showSignup ? "/login?mode=signup" : "/learn"} />} nativeButton={false} className="h-11 px-5">
            {showSignup ? "Create your account" : "Start learning"}
            <ArrowRightIcon />
          </Button>
          <Button
            render={<Link href={showSignup ? "/learn" : "/assistant"} />}
            nativeButton={false}
            variant="outline"
            className="h-11 bg-background px-5"
          >
            {showSignup ? "Start learning" : "Ask the assistant"}
          </Button>
        </div>
      </section>
    </main>
  )
}
