import { requireUser } from "@/lib/auth/guard"
import { parseSavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { getUserData, listChats } from "@/lib/db/account-data"
import { LESSONS } from "@/lib/learn/course"
import { parseProgress } from "@/lib/learn/progress"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"

// Everything the signed-in user has synced, for merging into the browser on sign-in.
export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response

  try {
    const [chats, finances, progress, profile, portfolio, budget] = await Promise.all([
      listChats(user.email),
      getUserData(user.email, "finances"),
      getUserData(user.email, "progress"),
      getUserData(user.email, "profile"),
      getUserData(user.email, "portfolio"),
      getUserData(user.email, "budget"),
    ])
    return Response.json(
      {
        chats,
        finances: parseImportedFinances(finances),
        progress: progress ? parseProgress(progress, LESSONS.map((lesson) => lesson.slug)) : null,
        profile: parseProfile(profile),
        portfolio: parsePortfolio(portfolio),
        budget: parseSavedBudgets(budget),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Failed to load account data:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't load your saved data." }, { status: 503 })
  }
}
