// "First Investments": a course for young investors, split into modules of short lessons.
// Lesson text lives in ./modules; this file holds the shape and lookup helpers.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { beforeYouInvest } from "./modules/01-before-you-invest.ts"
import { whatYouCanBuy } from "./modules/02-what-you-can-buy.ts"
import { riskAndReturn } from "./modules/03-risk-and-return.ts"
import { costsAccountsTaxes } from "./modules/04-costs-accounts-taxes.ts"
import { firstPortfolio } from "./modules/05-first-portfolio.ts"
import { protectYourself } from "./modules/06-protect-yourself.ts"

/** Interactive tools that can be placed inside a lesson. */
export type ToolId = "compound" | "doubling" | "fees" | "budget"

/** Text may use **bold** for emphasis; nothing else is interpreted. */
export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "callout"; tone: "example" | "tip" | "caution"; title: string; text: string }
  | { type: "table"; caption: string; headers: string[]; rows: string[][] }
  | { type: "tool"; tool: ToolId }

export type Section = { heading: string; blocks: Block[] }

export type QuizQuestion = {
  question: string
  options: string[]
  /** Index into options. */
  answer: number
  /** Shown after answering, right or wrong. */
  explanation: string
}

export type Lesson = {
  slug: string
  title: string
  minutes: number
  summary: string
  sections: Section[]
  takeaways: string[]
  /** Glossary terms used in the lesson, matched exactly against GLOSSARY. */
  keyTerms: string[]
  quiz: QuizQuestion[]
  /** A follow-up question for the assistant. */
  askPrompt: string
}

export type Module = {
  id: string
  title: string
  description: string
  lessons: Lesson[]
}

export const COURSE_TITLE = "First Investments"
export const COURSE_TAGLINE = "A plain-English investing course for teens and twenty-somethings."

export const MODULES: Module[] = [
  beforeYouInvest,
  whatYouCanBuy,
  riskAndReturn,
  costsAccountsTaxes,
  firstPortfolio,
  protectYourself,
]

export type LessonEntry = Lesson & { module: Module; moduleIndex: number; number: number }

/** Every lesson in course order, numbered from 1. */
export const LESSONS: LessonEntry[] = MODULES.flatMap((module, moduleIndex) =>
  module.lessons.map((lesson) => ({ ...lesson, module, moduleIndex }))
).map((lesson, index) => ({ ...lesson, number: index + 1 }))

export const TOTAL_MINUTES = LESSONS.reduce((sum, lesson) => sum + lesson.minutes, 0)

export function getLesson(slug: string) {
  return LESSONS.find((lesson) => lesson.slug === slug)
}

export function lessonNeighbors(slug: string) {
  const index = LESSONS.findIndex((lesson) => lesson.slug === slug)
  return {
    previous: index > 0 ? LESSONS[index - 1] : undefined,
    next: index >= 0 && index < LESSONS.length - 1 ? LESSONS[index + 1] : undefined,
  }
}

/** A slim copy of the course structure (no lesson text) for client components. */
export type OutlineModule = Pick<Module, "id" | "title" | "description"> & {
  lessons: { slug: string; title: string; minutes: number; number: number; quizLength: number }[]
}

export function courseOutline(): OutlineModule[] {
  return MODULES.map((module, moduleIndex) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    lessons: LESSONS.filter((lesson) => lesson.moduleIndex === moduleIndex).map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      minutes: lesson.minutes,
      number: lesson.number,
      quizLength: lesson.quiz.length,
    })),
  }))
}
