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
    return (
      <p className="my-4 rounded-lg border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground">
        This {kind} couldn&apos;t be displayed.
      </p>
    )
  }
  return artifact.kind === "chart" ? <ChartArtifact graph={artifact.graph} /> : <TableArtifact table={artifact.table} />
}

/** The element children of a node, ignoring whitespace between them. */
function elementChildren(node: HastNode | undefined) {
  return (node?.children ?? []).filter((child) => !(child.type === "text" && !(child.value ?? "").trim()))
}

/** A paragraph that is only one bold or italic run, such as the agent's "**Sources**" heading or a "_note_". */
function soleChild(node: HastNode | undefined) {
  const children = elementChildren(node)
  return children.length === 1 && children[0].type === "element" ? children[0].tagName : undefined
}

// The source list the agent appends to answers that searched the web (lib/ai/agent.ts).
const SOURCE_LABELS = new Set(["Sources", "Sources searched"])

// Prose keeps a comfortable reading measure; charts, tables and code blocks may use the full width.
const MEASURE = "max-w-[68ch]"

// Tailwind resets default element styles, so each Markdown element gets its own classes.
// Financial answers lean on tables, lists and worked numbers, so those get the most care.
const components: Components = {
  h1: (props) => <h3 className={`${MEASURE} mt-7 mb-2 text-lg leading-snug font-semibold first:mt-0`} {...domProps(props)} />,
  h2: (props) => <h3 className={`${MEASURE} mt-7 mb-2 text-lg leading-snug font-semibold first:mt-0`} {...domProps(props)} />,
  h3: (props) => <h4 className={`${MEASURE} mt-5 mb-1.5 font-sans text-[15px] font-semibold first:mt-0`} {...domProps(props)} />,
  p: ({ node, ...props }) => {
    const hast = node as HastNode | undefined
    const only = soleChild(hast)
    const text = hastText(hast).trim()
    // "Sources": a quiet label above the list of pages, set apart from the answer by a rule.
    // The list after it picks this up (peer-data-sources) and is drawn smaller.
    if (only === "strong" && SOURCE_LABELS.has(text)) {
      return (
        <p
          data-sources=""
          className={`peer ${MEASURE} mt-6 mb-2 border-t pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase`}
        >
          {text}
        </p>
      )
    }
    // A paragraph wholly in italics is the agent's own note (cut off, refused, a figure to check).
    if (only === "em") {
      return <p className={`${MEASURE} my-4 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-muted-foreground`} {...props} />
    }
    return <p className={`${MEASURE} my-3 leading-[1.7] first:mt-0 last:mb-0`} {...props} />
  },
  ul: (props) => <ul className={`${MEASURE} my-3 list-disc space-y-1.5 pl-5 marker:text-brand`} {...domProps(props)} />,
  ol: (props) => (
    <ol
      className={`${MEASURE} my-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary peer-data-sources:mt-0 peer-data-sources:space-y-1 peer-data-sources:text-[13px] peer-data-sources:marker:font-normal peer-data-sources:marker:text-muted-foreground`}
      {...domProps(props)}
    />
  ),
  li: (props) => <li className="pl-1 leading-[1.65] [&>ol]:mt-1.5 [&>ul]:mt-1.5" {...domProps(props)} />,
  // Every link opens in a new tab so the conversation stays put. A link to another site names that
  // site when its text doesn't: replies can repeat text from web pages, and the reader should see
  // where a link goes before clicking it (lib/chat/links.ts). rehypeSafeLinks has already taken
  // any data out of its address and turned other kinds of link into plain text.
  a: ({ node, href, children, ...props }) => {
    const link = describeLink(href, hastText(node as HastNode | undefined))
    const icon = link.kind === "external" && <ArrowUpRightIcon className="ml-0.5 inline size-3.5 align-[-0.125em] text-primary" aria-hidden="true" />
    return (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="group/link rounded-sm font-medium text-primary">
        {/* Only the link's own words are underlined, not the space and site name after them. */}
        <span className="underline decoration-primary/35 underline-offset-4 transition-colors duration-(--duration-fast) group-hover/link:decoration-primary">
          {children}
        </span>
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
  strong: (props) => <strong className="figures font-semibold text-foreground" {...domProps(props)} />,
  hr: () => <hr className={`${MEASURE} my-6 border-border`} />,
  // Inline code for short figures; fenced blocks for step-by-step calculations. A fence with no
  // language has no class either, so the <pre> below undoes the inline look for its code.
  code: ({ className, ...props }) =>
    className ? (
      <code className="figures font-mono text-[13px]" {...domProps(props)} />
    ) : (
      <code className="figures rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-primary" {...domProps(props)} />
    ),
  pre: ({ node, ...props }) => {
    const block = fencedBlock(node as HastNode | undefined)
    if (block && (block.language === "chart" || block.language === "table")) {
      return <Artifact kind={block.language} json={block.text.trim()} />
    }
    return (
      <pre
        className="figures my-4 overflow-x-auto rounded-xl border border-l-[3px] border-l-brand bg-background px-4 py-3 text-[13px] leading-relaxed shadow-xs [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[13px] [&_code]:text-foreground"
        {...props}
      />
    )
  },
  blockquote: (props) => (
    <blockquote className={`${MEASURE} my-4 rounded-r-lg border-l-2 border-brand bg-secondary/50 px-4 py-3`} {...domProps(props)} />
  ),
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-xl border bg-background shadow-xs">
      <table className="figures w-full border-collapse text-left text-sm" {...domProps(props)} />
    </div>
  ),
  thead: (props) => <thead className="bg-surface" {...domProps(props)} />,
  th: (props) => <th className="border-b px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground" {...domProps(props)} />,
  td: (props) => <td className="border-b px-3.5 py-2.5 align-top [tr:last-child_&]:border-0" {...domProps(props)} />,
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
