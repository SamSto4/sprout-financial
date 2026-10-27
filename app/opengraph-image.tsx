import { ImageResponse } from "next/og"

import { SocialCard } from "@/components/social-card"
import { LESSONS } from "@/lib/learn/course"
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site"

// The picture shown when any page is shared (lessons have their own). Drawn once at build time: it
// uses no request data. Served at /opengraph-image. A picture runs no scripts, so a
// Content-Security-Policy from proxy.ts on it changes nothing.
export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    <SocialCard title={SITE_TAGLINE} footer={`A ${LESSONS.length}-lesson course · calculators · an AI coach`} />,
    { ...size }
  )
}
