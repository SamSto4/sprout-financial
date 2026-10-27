import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

import { LESSONS, TOTAL_MINUTES, type LessonEntry } from "../learn/course.ts"
import { SITE_NAME } from "../site.ts"
import { courseJsonLd, faqPageJsonLd, homeJsonLd, isoDuration, lessonJsonLd, serializeJsonLd, type JsonLdObject } from "./json-ld.ts"
import { absoluteUrl, noindexMetadata, pageMetadata, siteMetadata } from "./metadata.ts"
import { HOME_TITLE, lessonSeo, NOINDEX_PATHS, PUBLIC_PAGES, TITLE_TEMPLATE, type PageSeo } from "./pages.ts"
import { robotsFile, sitemapEntries, sitemapPaths } from "./sitemap.ts"

const BASE = "https://sprout.test"
const APP = new URL("../../app/", import.meta.url)
const ALL_PAGES: PageSeo[] = [...Object.values(PUBLIC_PAGES), ...LESSONS.map(lessonSeo)]

/** The <title> a page ends up with. */
const fullTitle = (page: PageSeo) => (page.absoluteTitle ? page.title : TITLE_TEMPLATE.replace("%s", page.title))
/** The page.tsx that serves a path ("/" is app/page.tsx; the rest live in the (pages) group). */
const pageFile = (path: string) => new URL(path === "/" ? "page.tsx" : `(pages)${path}/page.tsx`, APP)
const read = (url: URL) => readFileSync(url, "utf8")

describe("page titles and descriptions", () => {
  it("fit in a search result: titles up to 60 characters, descriptions 50 to 160", () => {
    for (const page of ALL_PAGES) {
      assert.ok(fullTitle(page).length <= 60, `${page.path}: "${fullTitle(page)}" is ${fullTitle(page).length} characters`)
      assert.ok(page.description.length >= 50 && page.description.length <= 160, `${page.path}: description is ${page.description.length} characters`)
      for (const text of [page.title, page.description]) {
        assert.equal(text, text.trim(), `${page.path}: stray spaces`)
        assert.doesNotMatch(text, /\s{2,}/, `${page.path}: double space`)
      }
    }
  })

  it("are different on every page", () => {
    for (const field of ["title", "description"] as const) {
      const values = ALL_PAGES.map((page) => page[field])
      assert.equal(new Set(values).size, values.length, `two pages share a ${field}`)
    }
  })

  it("use plain paths: no trailing slash, query or fragment", () => {
    for (const page of ALL_PAGES) assert.match(page.path, /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/, page.path)
  })

  it("give the home page the whole title and every other page the template", () => {
    assert.equal(fullTitle(PUBLIC_PAGES.home), HOME_TITLE)
    assert.equal(fullTitle(PUBLIC_PAGES.about), `About · ${SITE_NAME}`)
  })
})

describe("every page is either public or noindex", () => {
  it("has a page file for each public path", () => {
    for (const page of Object.values(PUBLIC_PAGES)) assert.ok(existsSync(pageFile(page.path)), `${page.path} has no page.tsx`)
  })

  it("classifies each page in app/(pages), so a new page needs a decision", () => {
    const known = new Set<string>([...Object.values(PUBLIC_PAGES).map((page) => page.path), ...NOINDEX_PATHS])
    const pages = readdirSync(new URL("(pages)/", APP), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith("page.tsx") && !file.includes("["))
      .map((file) => `/${file.replace(/\\/g, "/").replace(/\/?page\.tsx$/, "")}`)
    assert.ok(pages.length > 5)
    for (const path of pages) assert.ok(known.has(path), `${path} is in neither PUBLIC_PAGES nor NOINDEX_PATHS (lib/seo/pages.ts)`)
  })

  it("wires each public page to pageMetadata and each noindex page to noindexMetadata", () => {
    for (const [id, page] of Object.entries(PUBLIC_PAGES)) {
      assert.match(read(pageFile(page.path)), new RegExp(`pageMetadata\\(PUBLIC_PAGES\\.${id}\\)`), `${page.path} doesn't export pageMetadata(PUBLIC_PAGES.${id})`)
    }
    assert.match(read(pageFile("/learn/[lesson]")), /pageMetadata\(lessonSeo\(lesson\)\)/)
    for (const path of NOINDEX_PATHS) {
      assert.match(read(pageFile(path)), /noindexMetadata\(|index: false/, `${path} isn't noindex`)
    }
  })

  it("never sets openGraph or twitter below the root layout (it would drop the share image)", () => {
    const files = readdirSync(APP, { recursive: true, encoding: "utf8" }).filter((file) => /(^|[\\/])(page|layout)\.tsx$/.test(file))
    for (const file of files) {
      assert.doesNotMatch(read(new URL(file, APP)), /\bopenGraph\b|\btwitter\s*:/, `app/${file} sets openGraph or twitter`)
    }
  })
})

describe("siteMetadata", () => {
  const live = siteMetadata({ base: BASE, indexable: true })

  it("resolves every relative URL against the real site address", () => {
    assert.equal((live.metadataBase as URL).href, `${BASE}/`)
  })

  it("sets the title template, share-card defaults and no image (app/opengraph-image.tsx adds it)", () => {
    assert.deepEqual(live.title, { default: HOME_TITLE, template: TITLE_TEMPLATE })
    assert.deepEqual(live.openGraph, { type: "website", siteName: SITE_NAME, locale: "en_US" })
    assert.deepEqual(live.twitter, { card: "summary_large_image" })
  })

  it("has no canonical, which every page without its own would inherit", () => {
    assert.equal("alternates" in live, false)
  })

  it("is indexable only when asked", () => {
    assert.equal("robots" in live, false)
    assert.deepEqual(siteMetadata({ base: BASE, indexable: false }).robots, { index: false, follow: false })
  })

  it("adds a well-formed Search Console token and ignores anything else", () => {
    assert.deepEqual(siteMetadata({ base: BASE, indexable: true, googleVerification: " abcDEF123_-xyz " }).verification, { google: "abcDEF123_-xyz" })
    for (const bad of ["", "short", '"><script>alert(1)</script>', "has spaces in it", "x".repeat(101)]) {
      assert.equal("verification" in siteMetadata({ base: BASE, indexable: true, googleVerification: bad }), false, bad)
    }
  })
})

describe("pageMetadata and noindexMetadata", () => {
  it("give a public page its title, description and canonical path, and nothing else", () => {
    assert.deepEqual(pageMetadata(PUBLIC_PAGES.about), {
      title: "About",
      description: PUBLIC_PAGES.about.description,
      alternates: { canonical: "/about" },
    })
    assert.deepEqual(pageMetadata(PUBLIC_PAGES.home).title, { absolute: HOME_TITLE })
    assert.equal(pageMetadata(PUBLIC_PAGES.home).alternates?.canonical, "/")
  })

  it("keep noindex pages out of results without a canonical, and keep their referrer policy", () => {
    assert.deepEqual(noindexMetadata("Log in"), { title: "Log in", robots: { index: false, follow: true } })
    assert.equal(noindexMetadata("Choose a new password", { referrer: "no-referrer" }).referrer, "no-referrer")
  })

  it("write URLs the way Next.js writes canonical links", () => {
    assert.equal(absoluteUrl(BASE, "/"), BASE)
    assert.equal(absoluteUrl(BASE, "/learn/funds"), `${BASE}/learn/funds`)
  })
})

describe("sitemap and robots.txt", () => {
  it("lists the home page, the course, every lesson in order, then the other public pages", () => {
    const paths = sitemapPaths()
    assert.deepEqual(paths.slice(0, 2 + LESSONS.length), ["/", "/learn", ...LESSONS.map((lesson) => `/learn/${lesson.slug}`)])
    assert.deepEqual(paths.slice(2 + LESSONS.length), ["/plan", "/portfolio", "/assistant", "/dashboard", "/about", "/faq"])
    assert.equal(new Set(paths).size, paths.length)
  })

  it("never lists a noindex page", () => {
    for (const path of NOINDEX_PATHS) assert.equal(sitemapPaths().includes(path), false, path)
  })

  it("gives only addresses on this site, with no made-up dates or priorities", () => {
    for (const entry of sitemapEntries(BASE)) {
      assert.deepEqual(Object.keys(entry), ["url"])
      assert.equal(new URL(entry.url).origin, BASE)
      assert.match(entry.url, /^https:\/\/sprout\.test(\/[a-z0-9/-]+)?$/)
    }
  })

  it("lets crawlers into production except the API, and points them at the sitemap", () => {
    assert.deepEqual(robotsFile({ base: BASE, indexable: true }), {
      rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
      sitemap: `${BASE}/sitemap.xml`,
    })
  })

  it("keeps crawlers out of previews and development, with no sitemap", () => {
    assert.deepEqual(robotsFile({ base: BASE, indexable: false }), { rules: [{ userAgent: "*", disallow: "/" }] })
  })
})

describe("structured data", () => {
  const graph = (data: JsonLdObject) => (data["@graph"] ?? [data]) as JsonLdObject[]

  it("can't be broken out of: <, > and & are escaped, and it reads back the same", () => {
    const hostile = { "@context": "https://schema.org", name: "</script><script>alert(1)</script> <!-- & -->", list: ["a<b", ">"] }
    const text = serializeJsonLd(hostile)
    assert.doesNotMatch(text, /[<>&]/)
    assert.deepEqual(JSON.parse(text), hostile)
  })

  it("names the site and its publisher on the home page", () => {
    const [organization, website] = graph(homeJsonLd(BASE))
    assert.equal(organization["@type"], "Organization")
    assert.equal(organization.url, BASE)
    assert.deepEqual(organization.logo, { "@type": "ImageObject", url: `${BASE}/apple-icon`, width: 180, height: 180 })
    assert.equal(website["@type"], "WebSite")
    assert.equal(website.name, SITE_NAME)
    assert.deepEqual(website.publisher, { "@id": organization["@id"] })
  })

  it("lists every lesson in the course, at the sitemap's addresses", () => {
    const course = courseJsonLd(BASE)
    const parts = course.hasPart as JsonLdObject[]
    assert.equal(course["@type"], "Course")
    assert.equal(course.timeRequired, isoDuration(TOTAL_MINUTES))
    assert.deepEqual(
      parts.map((part) => part.url),
      LESSONS.map((lesson) => `${BASE}/learn/${lesson.slug}`)
    )
  })

  it("describes each lesson with its own title and summary, and the trail back to the course", () => {
    for (const lesson of LESSONS) {
      const [resource, breadcrumbs] = graph(lessonJsonLd(BASE, lesson))
      assert.equal(resource["@type"], "LearningResource")
      assert.equal(resource.name, lesson.title)
      assert.equal(resource.description, lesson.summary)
      assert.equal(resource.url, `${BASE}/learn/${lesson.slug}`)
      assert.equal(resource.timeRequired, isoDuration(lesson.minutes))
      assert.deepEqual(resource.teaches, lesson.keyTerms)
      assert.equal((resource.isPartOf as JsonLdObject)["@id"], courseJsonLd(BASE)["@id"])
      const items = breadcrumbs.itemListElement as JsonLdObject[]
      assert.deepEqual(items.map((item) => item.position), [1, 2])
      assert.equal(items[0].item, `${BASE}/learn`)
      assert.equal(items[1].name, lesson.title)
      assert.equal("item" in items[1], false)
    }
  })

  it("leaves out `teaches` for a lesson with no key terms", () => {
    const lesson: LessonEntry = { ...LESSONS[0], keyTerms: [] }
    assert.equal("teaches" in graph(lessonJsonLd(BASE, lesson))[0], false)
  })

  it("turns FAQ entries into questions with answers, in order", () => {
    const data = faqPageJsonLd(BASE, [
      { question: "Is Sprout financial advice?", answer: "No." },
      { question: "What does it cost?", answer: "Nothing <yet> & more." },
    ])
    assert.equal(data["@type"], "FAQPage")
    assert.deepEqual(data.mainEntity, [
      { "@type": "Question", name: "Is Sprout financial advice?", acceptedAnswer: { "@type": "Answer", text: "No." } },
      { "@type": "Question", name: "What does it cost?", acceptedAnswer: { "@type": "Answer", text: "Nothing <yet> & more." } },
    ])
    assert.doesNotMatch(serializeJsonLd(data), /</)
  })

  it("writes durations the way schema.org expects", () => {
    assert.equal(isoDuration(0), "PT0M")
    assert.equal(isoDuration(6), "PT6M")
    assert.equal(isoDuration(6.4), "PT6M")
    assert.equal(isoDuration(60), "PT1H")
    assert.equal(isoDuration(131), "PT2H11M")
  })
})
