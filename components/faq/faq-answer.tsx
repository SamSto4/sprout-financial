import { Fragment } from "react"
import Link from "next/link"

import type { FaqBlock, FaqText } from "@/lib/faq"

const LINK = "font-medium text-primary underline underline-offset-4 hover:text-foreground"

function Runs({ runs }: { runs: FaqText[] }) {
  return runs.map((run, index) => {
    if (typeof run === "string") return <Fragment key={index}>{run}</Fragment>
    // Another answer on this page: a plain link, so the browser fires hashchange and
    // OpenLinkedQuestion opens it (an in-app navigation wouldn't).
    if (run.href.startsWith("#")) {
      return (
        <a key={index} href={run.href} className={LINK}>
          {run.text}
        </a>
      )
    }
    return (
      <Link key={index} href={run.href} className={LINK}>
        {run.text}
      </Link>
    )
  })
}

/** An answer from lib/faq.ts: paragraphs and bulleted lists, with links to pages on this site. */
export function FaqAnswer({ blocks }: { blocks: FaqBlock[] }) {
  return blocks.map((block, index) =>
    block.type === "p" ? (
      <p key={index}>
        <Runs runs={block.text} />
      </p>
    ) : (
      <ul key={index} className="list-disc space-y-2 pl-5 marker:text-brand">
        {block.items.map((runs, item) => (
          <li key={item}>
            <Runs runs={runs} />
          </li>
        ))}
      </ul>
    )
  )
}
