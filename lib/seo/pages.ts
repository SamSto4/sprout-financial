// What search engines and link previews show for each page: its title, description and canonical
// path, and which pages are public (listed in the sitemap) or kept out of search results.
// Kept free of framework imports so it can be unit-tested with `node --test` (seo.test.ts checks
// lengths, that no two pages share a title or description, and that every page exists).
//
// Like all of the site's copy, every claim here must be true of the code today (PRODUCT.md), and
// counts come from the code (lessons, quiz questions), never typed by hand.

import { COURSE_TITLE, LESSONS, type Lesson } from "../learn/course.ts"
import { RISK_QUESTIONS } from "../plan/profile.ts"
import { SITE_NAME, SITE_TAGLINE } from "../site.ts"

export type PageSeo = {
  /** Path on this site: also the page's canonical URL and its sitemap entry. */
  path: `/${string}`
  /** Shown as "<title> · Sprout" by the root layout's template, unless absoluteTitle is set. */
  title: string
  /** The title is the whole <title> (the home page). */
  absoluteTitle?: boolean
  /** What search results show under the title: 50 to 160 characters, or it gets cut. */
  description: string
}

/** The home page's title, and the default for any page that doesn't set one. */
export const HOME_TITLE = `${SITE_NAME} · ${SITE_TAGLINE}`

/** The template the root layout applies to every other page's title. */
export const TITLE_TEMPLATE = `%s · ${SITE_NAME}`

/** Public pages, in sitemap order (the lessons follow /learn). Each page.tsx exports pageMetadata(PUBLIC_PAGES.<id>). */
export const PUBLIC_PAGES = {
  home: {
    path: "/",
    title: HOME_TITLE,
    absoluteTitle: true,
    description: `Learn budgeting, saving, debt and investing in plain English, with a ${LESSONS.length}-lesson course, calculators that show their working, a money plan and an AI coach.`,
  },
  learn: {
    path: "/learn",
    title: `Investing course for beginners: ${COURSE_TITLE}`,
    description: `${LESSONS.length} short lessons on investing basics: what to sort out first, stocks, bonds and index funds, risk, fees, accounts, taxes and scams. Each ends with a quiz.`,
  },
  plan: {
    path: "/plan",
    title: "Money plan and risk quiz",
    description: `Tell Sprout about your goals, savings and debts and take a ${RISK_QUESTIONS.length}-question risk quiz. You get a step-by-step money roadmap and a target mix for your investments.`,
  },
  portfolio: {
    path: "/portfolio",
    title: "Portfolio check-up",
    description:
      "See what your investments really hold, what fees cost you, how your mix compares with your plan, and what a market drop could mean. Nothing here buys or sells.",
  },
  assistant: {
    path: "/assistant",
    title: "AI money coach",
    description:
      "Ask about budgeting, debt, saving and investing in plain English. The AI coach explains the why, uses tested calculators and teaches strategy, not stock picks.",
  },
  dashboard: {
    path: "/dashboard",
    title: "Spending dashboard and budget planner",
    description:
      "Import a bank CSV or screenshots to see where your money goes by category and month, then plan a monthly budget against the 50/30/20 guideline.",
  },
  about: {
    path: "/about",
    title: "About",
    description:
      "Why Sprout exists: young people learn investing from feeds built for clicks. Sprout gives them a plan, honest math and a coach that knows their situation.",
  },
  faq: {
    path: "/faq",
    title: "FAQ",
    description:
      "Straight answers about Sprout: who it's for, what it costs, where your data is stored, what the AI assistant sees, and how accounts work.",
  },
} satisfies Record<string, PageSeo>

export type PublicPageId = keyof typeof PUBLIC_PAGES

/** A lesson's page: its own title and summary, so each lesson can rank for what it teaches. */
export function lessonSeo(lesson: Pick<Lesson, "slug" | "title" | "summary">): PageSeo {
  return { path: `/learn/${lesson.slug}`, title: lesson.title, description: lesson.summary }
}

/**
 * Pages kept out of search results (noindex) and out of the sitemap: the account page, sign-in, and
 * pages opened from links in emails. They stay crawlable (robots.txt doesn't block them), because a
 * crawler has to load a page to see its noindex. Opening them changes nothing: the email-link pages
 * only act when their form is submitted.
 */
export const NOINDEX_PATHS = ["/account", "/login", "/forgot-password", "/reset-password", "/verify-email"] as const
