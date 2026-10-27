// Structured data (schema.org JSON-LD): tells search engines and AI assistants what a page is. The
// home page describes the site and who publishes it, /learn the course, each lesson itself and
// where it sits in the course, and /faq its questions. Pure so it can be unit-tested with
// `node --test` (seo.test.ts); components/json-ld.tsx prints it.
//
// Two rules (Google's structured data guidelines):
// - Describe only what the page shows. Lesson names and summaries are the page's own h1 and summary;
//   FAQ answers are the page's answers as plain text.
// - Only claims that are true of the code today. `isAccessibleForFree` says the course costs nothing
//   to read; change it if that ever stops being true.

import { COURSE_TAGLINE, COURSE_TITLE, LESSONS, TOTAL_MINUTES, type LessonEntry } from "../learn/course.ts"
import { SITE_NAME } from "../site.ts"
import { absoluteUrl } from "./metadata.ts"
import { lessonSeo, PUBLIC_PAGES } from "./pages.ts"

export type JsonLdValue = string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue }
export type JsonLdObject = { [key: string]: JsonLdValue }

const CONTEXT = "https://schema.org"

/** Another name people may know the site by, for the site name Google shows in results. */
export const SITE_ALTERNATE_NAME = "Sprout Financial"

const ORGANIZATION_DESCRIPTION =
  "Sprout teaches budgeting, saving, debt and investing in plain English. It's educational information, not financial advice."

/** schema.org's timeRequired is an ISO 8601 duration: 6 minutes is "PT6M", 131 is "PT2H11M". */
export function isoDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return `PT${hours ? `${hours}H` : ""}${rest || !hours ? `${rest}M` : ""}`
}

const organizationId = (base: string) => `${base}/#organization`
const courseId = (base: string) => `${base}/learn#course`

/** A reference to the publisher, for nodes on other pages. */
function publisher(base: string): JsonLdObject {
  return { "@type": "Organization", "@id": organizationId(base), name: SITE_NAME, url: absoluteUrl(base, "/") }
}

/** Home page: the organization behind the site, and the site itself (its name in search results). */
export function homeJsonLd(base: string): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId(base),
        name: SITE_NAME,
        url: absoluteUrl(base, "/"),
        // app/apple-icon.tsx: a 180 x 180 PNG (Google asks for at least 112 x 112).
        logo: { "@type": "ImageObject", url: `${base}/apple-icon`, width: 180, height: 180 },
        description: ORGANIZATION_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAME,
        url: absoluteUrl(base, "/"),
        description: PUBLIC_PAGES.home.description,
        inLanguage: "en",
        publisher: { "@id": organizationId(base) },
      },
    ],
  }
}

/** /learn: the course and its lessons, in order. */
export function courseJsonLd(base: string): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "Course",
    "@id": courseId(base),
    name: COURSE_TITLE,
    description: COURSE_TAGLINE,
    url: absoluteUrl(base, "/learn"),
    inLanguage: "en",
    educationalLevel: "Beginner",
    isAccessibleForFree: true,
    timeRequired: isoDuration(TOTAL_MINUTES),
    provider: publisher(base),
    hasPart: LESSONS.map((lesson) => {
      const url = absoluteUrl(base, lessonSeo(lesson).path)
      return { "@type": "LearningResource", "@id": `${url}#lesson`, name: lesson.title, url, position: lesson.number }
    }),
  }
}

/** A lesson page: the lesson, and the breadcrumb back to the course (the page shows the same trail). */
export function lessonJsonLd(base: string, lesson: LessonEntry): JsonLdObject {
  const url = absoluteUrl(base, lessonSeo(lesson).path)
  return {
    "@context": CONTEXT,
    "@graph": [
      {
        "@type": "LearningResource",
        "@id": `${url}#lesson`,
        name: lesson.title,
        description: lesson.summary,
        url,
        inLanguage: "en",
        learningResourceType: "Lesson",
        educationalLevel: "Beginner",
        isAccessibleForFree: true,
        timeRequired: isoDuration(lesson.minutes),
        position: lesson.number,
        ...(lesson.keyTerms.length ? { teaches: lesson.keyTerms } : {}),
        isPartOf: { "@type": "Course", "@id": courseId(base), name: COURSE_TITLE, url: absoluteUrl(base, "/learn") },
        publisher: publisher(base),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: COURSE_TITLE, item: absoluteUrl(base, "/learn") },
          { "@type": "ListItem", position: 2, name: lesson.title },
        ],
      },
    ],
  }
}

export type FaqEntry = { question: string; answer: string }

/** /faq: each question with its answer as plain text (faqAnswerText in lib/faq.ts). */
export function faqPageJsonLd(base: string, entries: FaqEntry[]): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    url: absoluteUrl(base, "/faq"),
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  }
}

/**
 * The text of a <script type="application/ld+json"> block. JSON.stringify alone lets a value close
 * the tag ("</script>") or open an HTML comment ("<!--"), so <, > and & are written as \u escapes,
 * which JSON readers turn back into the same characters
 * (node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
 */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
}
