import { ImageResponse } from "next/og"

import { SocialCard } from "@/components/social-card"
import { COURSE_TITLE, getLesson, LESSONS } from "@/lib/learn/course"
import { SITE_NAME } from "@/lib/site"

// The picture shown when a lesson is shared: its title and place in the course. One per lesson,
// drawn at build time; any other slug is a 404, like the lesson page. Served at
// /learn/<slug>/opengraph-image-<hash> (Next.js adds the hash because of the (pages) group). A
// picture runs no scripts, so a Content-Security-Policy from proxy.ts on it changes nothing.
export const alt = `Lesson card from ${SITE_NAME}'s ${COURSE_TITLE} course`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const dynamicParams = false

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ lesson: lesson.slug }))
}

export default async function LessonOpenGraphImage({ params }: { params: Promise<{ lesson: string }> }) {
  const lesson = getLesson((await params).lesson)
  if (!lesson) return new Response("Not found", { status: 404 })
  return new ImageResponse(
    <SocialCard
      eyebrow={`${COURSE_TITLE} · Lesson ${lesson.number} of ${LESSONS.length}`}
      title={lesson.title}
      footer={`${lesson.minutes} min read`}
    />,
    { ...size }
  )
}
