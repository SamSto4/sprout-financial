// How links in an assistant reply are shown. Replies can repeat text from web pages, so a link to
// another site names that site whenever its text doesn't, and the reader sees where it goes
// before clicking. Kept free of framework imports so it can be unit-tested with `node --test`.

export type LinkInfo = {
  /** "internal" for this site, "external" for another http(s) site, "other" for anything else (mailto:). */
  kind: "internal" | "external" | "other"
  /** The other site's host name (without "www."), when the link text doesn't already show it. */
  host: string | null
}

// Relative links are resolved against a placeholder origin the way a browser resolves them
// against this site, so "//host" and "/\host" count as the other sites they really open.
const BASE = "https://this-site.invalid"

export function describeLink(href: string | undefined, text: string): LinkInfo {
  if (!href) return { kind: "other", host: null }
  let url: URL
  try {
    url = new URL(href, BASE)
  } catch {
    return { kind: "other", host: null }
  }
  if (url.origin === BASE) return { kind: "internal", host: null }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "other", host: null }
  const host = url.hostname.replace(/^www\./, "")
  return { kind: "external", host: showsHost(text, host) ? null : host }
}

/**
 * Whether the link text already names the host as a whole word ("Investor.gov", "www.sec.gov",
 * "https://example.com/x"), not as part of a longer name: "evil.example.bank.com" doesn't name
 * evil.example, it hides it. Words are split with a plain character class and compared, so this
 * stays linear on long hostile text.
 */
function showsHost(text: string, host: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.-]+/)
    .some((word) => {
      const name = word.split(".").filter(Boolean).join(".")
      return (name.startsWith("www.") ? name.slice(4) : name) === host
    })
}
