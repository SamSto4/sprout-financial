import { requireUser } from "@/lib/auth/guard"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { getUserData, listChats } from "@/lib/db/account-data"
import { LESSONS } from "@/lib/learn/course"
import { parseProgress } from "@/lib/learn/progress"

// Everything the signed-in user has synced, for merging into the browser on sign-in.
export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response

  try {
    const [chats, finances, progress] = await Promise.all([
      listChats(user.email),
      getUserData(user.email, "finances"),
      getUserData(user.email, "progress"),
    ])
    return Response.json(
      {
        chats,
        finances: parseImportedFinances(finances),
        progress: progress ? parseProgress(progress, LESSONS.map((lesson) => lesson.slug)) : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Failed to load account data:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't load your saved data." }, { status: 503 })
  }
}
