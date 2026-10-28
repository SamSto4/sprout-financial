import { memo } from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowUpRightIcon } from "lucide-react"

import { ChartArtifact } from "@/components/artifacts/chart-artifact"
import { TableArtifact } from "@/components/artifacts/table-artifact"
import { parseArtifact } from "@/lib/ai/artifacts"
import { describeLink } from "@/lib/chat/links"
import { rehypeNoImages, rehypeSafeLinks } from "@/lib/chat/markdown-safety"

type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] }

/** The language and text of a fenced block, read from the code element inside a <pre>. */
function fencedBlock(node: HastNode | undefined) {
  const code = node?.children?.find((child) => child.type === "element" && child.tagName === "code")
  const classes = code?.properties?.className
  const language = Array.isArray(classes) ? classes.map(String).find((name) => name.startsWith("language-")) : undefined
  if (!code || !language) return null
  const text = (code.children ?? []).map((child) => (child.type === "text" ? (child.value ?? "") : "")).join("")
  return { language: language.slice("language-".length), text }
}

/** All the text inside a syntax-tree node, such as a link's visible words. */
function hastText(node: HastNode | undefined): string {
  if (!node) return ""
  if (node.type === "text") return node.value ?? ""
  return (node.children ?? []).map(hastText).join("")
}

/**
 * react-markdown hands every component the syntax-tree node it came from. Spread onto an element,
 * it reached the DOM as node="[object Object]", so each component drops it first.
 */
function domProps<P extends ExtraProps>({ node, ...props }: P): Omit<P, "node"> {
  void node
  return props
}

/** Charts and tables the agent added; anything unreadable shows a short note instead of raw JSON. */
function Artifact({ kind, json }: { kind: string; json: string }) {
  const artifact = parseArtifact(kind, json)
  if (!artifact) {
    return <p className="my-3 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground">This {kind} couldn&apos;t be displayed.</p>
  }
  return artifact.kind === "chart" ? <ChartArtifact graph={artifact.graph} /> : <TableArtifact table={artifact.table} />
}

// Tailwind resets default element styles, so each Markdown element gets its own classes.
// Financial answers lean on tables, lists and worked numbers, so those get the most care.
const components: Components = {
  h1: (props) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...domProps(props)} />,
  h2: (props) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...domProps(props)} />,
  h3: (props) => <h4 className="mt-4 mb-1.5 font-sans text-[15px] font-semibold first:mt-0" {...domProps(props)} />,
  p: (props) => <p className="my-2.5 leading-relaxed first:mt-0 last:mb-0" {...domProps(props)} />,
  ul: (props) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 marker:text-brand" {...domProps(props)} />,
  ol: (props) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-primary" {...domProps(props)} />,
  li: (props) => <li className="pl-1 leading-relaxed" {...domProps(props)} />,
  // Every link opens in a new tab so the conversation stays put. A link to another site names that
  // site when its text doesn't: replies can repeat text from web pages, and the reader should see
  // where a link goes before clicking it (lib/chat/links.ts). rehypeSafeLinks has already taken
  // any data out of its address and turned other kinds of link into plain text.
  a: ({ node, href, children, ...props }) => {
    const link = describeLink(href, hastText(node as HastNode | undefined))
    const icon = link.kind === "external" && <ArrowUpRightIcon className="ml-0.5 inline size-3.5 align-[-0.125em] text-primary" aria-hidden="true" />
    return (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary">
        {/* Only the link's own words are underlined, not the space and site name after them. */}
        <span className="underline underline-offset-4">{children}</span>
        {link.host ? (
          <>
            {" "}
            {/* One box, so the site name and arrow move to the next line together; a host too long
                for the line wraps inside it rather than widening the reply. */}
            <span className="inline-block max-w-full text-[0.85em] font-normal wrap-anywhere text-muted-foreground">
              ({link.host}){icon}
            </span>
          </>
        ) : (
          icon
        )}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  },
  strong: (props) => <strong className="font-semibold text-foreground" {...domProps(props)} />,
  hr: () => <hr className="my-4 border-border" />,
  // Inline code for short figures; fenced blocks for step-by-step calculations.
  code: ({ className, ...props }) =>
    className ? (
      <code className="figures font-mono text-[13px]" {...domProps(props)} />
    ) : (
      <code className="figures rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em] text-primary" {...domProps(props)} />
    ),
  pre: ({ node, ...props }) => {
    const block = fencedBlock(node as HastNode | undefined)
    if (block && (block.language === "chart" || block.language === "table")) {
      return <Artifact kind={block.language} json={block.text.trim()} />
    }
    return <pre className="figures my-3 overflow-x-auto rounded-lg border-l-2 border-brand bg-surface px-3.5 py-3 text-[13px] leading-relaxed" {...props} />
  },
  blockquote: (props) => <blockquote className="my-3 rounded-r-lg border-l-2 border-brand bg-surface px-3.5 py-2.5" {...domProps(props)} />,
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="figures w-full border-collapse text-left text-sm" {...domProps(props)} />
    </div>
  ),
  thead: (props) => <thead className="bg-surface" {...domProps(props)} />,
  th: (props) => <th className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground" {...domProps(props)} />,
  td: (props) => <td className="border-b px-3 py-2 align-top [tr:last-child_&]:border-0" {...domProps(props)} />,
}

/**
 * One reply rendered from Markdown. Memoized on its text: while an answer streams, only the
 * message that is changing is parsed again, not every earlier reply (and its charts).
 */
export const ChatMarkdown = memo(function ChatMarkdown({ children }: { children: string }) {
  return (
    // rehypeNoImages: images in a reply would load automatically and could leak the user's data
    // to any URL a web page talked the model into writing. rehypeSafeLinks: links are the same
    // channel behind a click, so they keep only where they go (see lib/chat/markdown-safety.ts).
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeNoImages, rehypeSafeLinks]} components={components}>
      {children}
    </ReactMarkdown>
  )
})
