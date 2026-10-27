import { ContinueCards } from "@/components/home/continue-cards"
import { TryItSection } from "@/components/home/try-it-section"
import { LESSONS } from "@/lib/learn/course"

/** The home page for signed-in visitors: where to pick up, then the same calculator as the landing page. */
export function SignedInHome({ syncs }: { syncs: boolean }) {
  // Only what the cards need, so the lesson text stays out of the browser bundle.
  const lessons = LESSONS.map(({ slug, title, number }) => ({ slug, title, number }))
  return (
    <main>
      <section className="border-b bg-surface" aria-labelledby="home-title">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="eyebrow">Your next steps</p>
          {/* Neutral on purpose: people who just confirmed their email land here too. */}
          <h1 id="home-title" className="mt-2 text-3xl font-semibold sm:text-4xl">
            What would you like to do today?
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {syncs ? "Your work is saved to your account and kept in step across your devices." : "Your work is saved in this browser."}
          </p>
          <div className="mt-8">
            <ContinueCards lessons={lessons} />
          </div>
        </div>
      </section>
      <TryItSection signedIn />
    </main>
  )
}
