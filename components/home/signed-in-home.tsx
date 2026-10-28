import { GrowthLine } from "@/components/growth-line"
import { ContinueCards } from "@/components/home/continue-cards"
import { TryItSection } from "@/components/home/try-it-section"
import { LESSONS } from "@/lib/learn/course"

/** The home page for signed-in visitors: where to pick up, then the same calculator as the landing page. */
export function SignedInHome({ syncs }: { syncs: boolean }) {
  // Only what the cards need, so the lesson text stays out of the browser bundle.
  const lessons = LESSONS.map(({ slug, title, number }) => ({ slug, title, number }))
  return (
    <main>
      <section className="relative overflow-hidden border-b bg-surface" aria-labelledby="home-title">
        <GrowthLine className="pointer-events-none absolute top-14 right-[max(2.5rem,calc((100vw-72rem)/2+2.5rem))] hidden h-24 w-64 lg:block" />
        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24">
          <div className="animate-rise">
            <p className="eyebrow">Your next steps</p>
            {/* Neutral on purpose: people who just confirmed their email land here too. */}
            <h1 id="home-title" className="display mt-4 max-w-2xl text-[2.375rem] sm:text-5xl lg:text-[3.5rem]">
              What would you like to do today?
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
              {syncs ? "Your work is saved to your account and kept in step across your devices." : "Your work is saved in this browser."}
            </p>
          </div>
          <div className="mt-10 sm:mt-12">
            <ContinueCards lessons={lessons} />
          </div>
        </div>
      </section>
      <TryItSection signedIn />
    </main>
  )
}
