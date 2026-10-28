"use client"

import { useId, useRef } from "react"
import Link from "next/link"
import { ArrowRightIcon, BriefcaseIcon, UserRoundIcon } from "lucide-react"

import { BriefPreview } from "@/components/about-you/brief-preview"
import { formatMoney } from "@/lib/format"
import type { CourseLesson } from "@/lib/plan/about-card"
import { countryByCode } from "@/lib/plan/countries"
import { focusLabels } from "@/lib/plan/focus"
import {
  hasPlanDetails,
  profileCountryCode,
  profileCurrency,
  RISK_LABELS,
  riskLevel,
  type InvestorProfile,
} from "@/lib/plan/profile"
import { buildRoadmap } from "@/lib/plan/roadmap"
import { undoSave } from "@/lib/plan/remember"
import {
  portfolioStore,
  profileStore,
  progressStore,
  saveProfile,
  shareLessonsStore,
  sharePlanChoiceStore,
  sharePlanStore,
  sharePortfolioStore,
} from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

/** The lines About you shows, in the order the summary uses. Labels and values written here. */
function summaryLines(profile: InvestorProfile): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = []
  const focus = profile.focus ?? []
  if (focus.length > 0) lines.push({ label: "Wants help with", value: focusLabels(focus) })
  const code = profileCountryCode(profile)
  const currency = profileCurrency(profile)
  const country = code ? (countryByCode(code)?.name ?? code) : profile.country.trim()
  if (country) lines.push({ label: "Country", value: currency ? `${country} (amounts in ${currency})` : country })
  if (hasPlanDetails(profile)) {
    const roadmap = buildRoadmap(profile)
    lines.push({
      label: "Money roadmap",
      value: roadmap.current
        ? `Step ${roadmap.steps.indexOf(roadmap.current) + 1} of ${roadmap.steps.length}: ${roadmap.current.title}`
        : "Every step done",
    })
  }
  const level = riskLevel(profile.riskAnswers)
  if (level) lines.push({ label: "Risk level", value: RISK_LABELS[level] })
  return lines
}

/**
 * About you, in the assistant's side panel and (on phones) its bottom sheet: what answers on this
 * device use, the switch for it, a preview of exactly what's sent, and the separate portfolio
 * switch. Everything here is per device and never synced (lib/stores.ts).
 */
export function AboutYouPanel({
  lessons,
  previewOpen,
  onPreviewOpenChange,
  showTitle = true,
}: {
  /** The course outline (slug and title), for the lesson count and the preview. */
  lessons: readonly CourseLesson[]
  previewOpen: boolean
  onPreviewOpenChange: (open: boolean) => void
  /** False inside the sheet, which has its own title. */
  showTitle?: boolean
}) {
  const id = useId()
  const profile = useStoredValue(profileStore)
  const portfolio = useStoredValue(portfolioStore)
  const progress = useStoredValue(progressStore)
  const choice = useStoredValue(sharePlanChoiceStore)
  const shareLessons = useStoredValue(shareLessonsStore)
  const sharePortfolio = useStoredValue(sharePortfolioStore)
  const loaded = useHydrated()
  const on = choice === true

  const known = new Set(lessons.map((lesson) => lesson.slug))
  const finished = progress.completed.filter((slug) => known.has(slug))
  const lines = profile ? summaryLines(profile) : []
  const holdings = portfolio?.holdings ?? []
  const total = holdings.reduce((sum, holding) => sum + holding.value, 0)
  const focusSaved = (profile?.focus?.length ?? 0) > 0
  const switchRef = useRef<HTMLInputElement>(null)

  function clearFocus() {
    const current = profileStore.get()
    if (!current) return
    // Removes the topics; a profile that held nothing else goes away with them. A removal never
    // turns About you on, even on a device that hasn't chosen yet.
    const next = undoSave(current, null, "focus")
    if (next) saveProfile(next, "about", undefined, { mayTurnOn: false })
    else profileStore.set(null)
    // The Clear button goes away with the topics; keep focus in the panel, on its switch.
    switchRef.current?.focus()
  }

  return (
    <section aria-labelledby={showTitle ? `${id}-title` : undefined} aria-label={showTitle ? undefined : "About you"} className="space-y-2.5">
      {showTitle && (
        <h2
          id={`${id}-title`}
          tabIndex={-1}
          className="-mx-1 flex items-center gap-2 rounded-md px-1 font-sans text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <UserRoundIcon className="size-4 text-primary" aria-hidden="true" />
          About you
        </h2>
      )}
      <p className="text-xs text-muted-foreground">What the assistant knows about you, so answers fit. Used on this device while the switch is on.</p>

      {loaded && (
        <>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-background">
            <input
              ref={switchRef}
              type="checkbox"
              role="switch"
              checked={on}
              onChange={(event) => sharePlanStore.set(event.target.checked)}
              className="mt-0.5 size-3.5 accent-primary"
            />
            <span>
              <span className="block font-medium">Use About you in answers</span>
              <span className="text-muted-foreground">
                {on
                  ? "Sent with each question on this device."
                  : choice === false
                    ? "Off on this device: nothing from About you is sent."
                    : "Not chosen on this device yet, so nothing from About you is sent."}
              </span>
            </span>
          </label>

          <div className="space-y-2 rounded-xl border bg-background px-3 py-2.5 text-xs">
            {lines.length === 0 && finished.length === 0 ? (
              <p className="text-muted-foreground">
                Nothing saved yet. Pick a topic in an empty chat, or fill in My plan, so answers fit your goals instead of starting
                from scratch.
              </p>
            ) : (
              <dl className="space-y-1.5">
                {lines.map((line) => (
                  <div key={line.label} className="flex flex-wrap items-baseline gap-x-1.5">
                    <dt className="font-medium">{line.label}:</dt>
                    <dd className="min-w-0 text-muted-foreground">{line.value}</dd>
                    {line.label === "Wants help with" && focusSaved && (
                      <dd>
                        <button
                          type="button"
                          onClick={clearFocus}
                          className="rounded px-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          Clear
                        </button>
                      </dd>
                    )}
                  </div>
                ))}
                {finished.length > 0 && (
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <dt className="font-medium">Lessons finished:</dt>
                    <dd className="text-muted-foreground">
                      {finished.length} of {lessons.length}
                      {shareLessons ? "" : " (not used)"}
                    </dd>
                    <dd>
                      <button
                        type="button"
                        onClick={() => shareLessonsStore.set(!shareLessons)}
                        className="rounded px-1 font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {shareLessons ? "Don't use these" : "Use these again"}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <Link href="/plan" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Edit on My plan <ArrowRightIcon className="size-3" aria-hidden="true" />
            </Link>
          </div>

          <BriefPreview
            profile={profile}
            completedLessons={shareLessons ? finished : []}
            lessons={lessons}
            on={on}
            open={previewOpen}
            onOpenChange={onPreviewOpenChange}
          />

          <div className="space-y-1 pt-1">
            <h3 className="flex items-center gap-2 px-0.5 font-sans text-xs font-semibold">
              <BriefcaseIcon className="size-3.5 text-primary" aria-hidden="true" />
              Your portfolio
            </h3>
            {holdings.length === 0 ? (
              <p className="px-0.5 text-xs text-muted-foreground">
                No holdings entered.{" "}
                <Link href="/portfolio" className="font-medium text-primary hover:underline">
                  Add them on Portfolio
                </Link>
              </p>
            ) : (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-background">
                <input
                  data-portfolio-switch
                  type="checkbox"
                  role="switch"
                  checked={sharePortfolio}
                  onChange={(event) => sharePortfolioStore.set(event.target.checked)}
                  className="mt-0.5 size-3.5 accent-primary"
                />
                <span>
                  <span className="block font-medium">Let the assistant see my portfolio</span>
                  <span className="text-muted-foreground">
                    {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}, {formatMoney(total)}.{" "}
                    {sharePortfolio ? "Sent with each question." : "Off: answers won't use your holdings."}
                  </span>
                </span>
              </label>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Sprout is an educational tool. Saving details makes answers fit you; it isn&apos;t personal financial advice.
          </p>
        </>
      )}
    </section>
  )
}
