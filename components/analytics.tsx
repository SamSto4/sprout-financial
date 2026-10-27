"use client"

import { Analytics as VercelAnalytics } from "@vercel/analytics/next"

import { redactAnalyticsEvent } from "@/lib/analytics"

/**
 * Vercel Web Analytics: page views only, no cookies. Data appears under Analytics in the Vercel
 * dashboard. URLs are sent without their query string or fragment (lib/analytics.ts), so a token
 * or a typed question never reaches it. A client component because beforeSend is a function.
 */
export function Analytics() {
  return <VercelAnalytics beforeSend={redactAnalyticsEvent} />
}
