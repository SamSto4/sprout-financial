import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { ChartArtifact } from "@/components/artifacts/chart-artifact"
import { TableArtifact } from "@/components/artifacts/table-artifact"
import { parseArtifact } from "@/lib/ai/artifacts"
import { rehypeNoImages } from "@/lib/chat/markdown-safety"

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
  h1: (props) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...props} />,
  h3: (props) => (
    <h4 className="mt-4 mb-1.5 font-sans text-[15px] font-semibold first:mt-0" {...props} />
  ),
  p: (props) => <p className="my-2.5 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 marker:text-brand" {...props} />,
  ol: (props) => (
    <ol className="my-2.5 list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-primary" {...props} />
  ),
  li: (props) => <li className="pl-1 leading-relaxed" {...props} />,
  a: (props) => (
    <a
      className="font-medium text-primary underline underline-offset-4"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  hr: () => <hr className="my-4 border-border" />,
  // Inline code for short figures; fenced blocks for step-by-step calculations.
  code: ({ className, ...props }) =>
    className ? (
      <code className="figures font-mono text-[13px]" {...props} />
    ) : (
      <code className="figures rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em] text-primary" {...props} />
    ),
  pre: ({ node, ...props }) => {
    const block = fencedBlock(node as HastNode | undefined)
    if (block && (block.language === "chart" || block.language === "table")) {
      return <Artifact kind={block.language} json={block.text.trim()} />
    }
    return (
      <pre
        className="figures my-3 overflow-x-auto rounded-lg border-l-2 border-brand bg-surface px-3.5 py-3 text-[13px] leading-relaxed"
        {...props}
      />
    )
  },
  blockquote: (props) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-brand bg-surface px-3.5 py-2.5" {...props} />
  ),
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="figures w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-surface" {...props} />,
  th: (props) => <th className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground" {...props} />,
  td: (props) => <td className="border-b px-3 py-2 align-top [tr:last-child_&]:border-0" {...props} />,
}

export function ChatMarkdown({ children }: { children: string }) {
  return (
    // rehypeNoImages: images in a reply would load automatically and could leak the user's data
    // to any URL a web page talked the model into writing (see lib/chat/markdown-safety.ts).
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeNoImages]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
