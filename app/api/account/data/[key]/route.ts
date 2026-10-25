import { readJson, requireUser } from "@/lib/auth/guard"
import { deleteUserData, setUserData, type DataKey } from "@/lib/db/account-data"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { LESSONS } from "@/lib/learn/course"
import { parseProgress } from "@/lib/learn/progress"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"

// Each synced value is validated with the same parser the browser uses for its own storage.
const PARSERS: Record<DataKey, (raw: unknown) => unknown> = {
  finances: parseImportedFinances,
  progress: (raw) =>
    typeof raw === "object" && raw !== null ? parseProgress(raw, LESSONS.map((lesson) => lesson.slug)) : null,
  profile: parseProfile,
  portfolio: parsePortfolio,
}

function isKey(key: string): key is DataKey {
  return key in PARSERS
}

export async function PUT(request: Request, context: RouteContext<"/api/account/data/[key]">) {
  const user = await requireUser()
  if ("response" in user) return user.response

  const { key } = await context.params
  if (!isKey(key)) return Response.json({ error: "Unknown data." }, { status: 404 })
  const value = PARSERS[key](await readJson(request))
  if (value === null) return Response.json({ error: "That data couldn't be read." }, { status: 400 })

  try {
    await setUserData(user.email, key, value)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(`Failed to save ${key}:`, error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't save your data." }, { status: 503 })
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/account/data/[key]">) {
  const user = await requireUser()
  if ("response" in user) return user.response

  const { key } = await context.params
  if (!isKey(key)) return Response.json({ error: "Unknown data." }, { status: 404 })

  try {
    await deleteUserData(user.email, key)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(`Failed to delete ${key}:`, error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't delete your data." }, { status: 503 })
  }
}
