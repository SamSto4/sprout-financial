import { confirmsDeletion, deleteAccountEverywhere } from "@/lib/auth/account-deletion"
import { readBody, requireUser, syncLimitResponse } from "@/lib/auth/guard"
import { deleteUser } from "@/lib/auth/users"
import { parseSavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { jsonBytes, MAX_ACCOUNT_LOAD_BYTES, takeChatsWithinBytes } from "@/lib/chat/history"
import { deleteAccountData, getUserData, listChats } from "@/lib/db/account-data"
import { LESSONS } from "@/lib/learn/course"
import { parseProgress } from "@/lib/learn/progress"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"

// Everything the signed-in user has synced, for merging into the browser on sign-in.
export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response
  const limited = await syncLimitResponse(user.email, "accountLoad")
  if (limited) return limited

  try {
    const [chats, finances, progress, profile, portfolio, budget] = await Promise.all([
      listChats(user.email),
      getUserData(user.email, "finances"),
      getUserData(user.email, "progress"),
      getUserData(user.email, "profile"),
      getUserData(user.email, "portfolio"),
      getUserData(user.email, "budget"),
    ])
    const rest = {
      finances: parseImportedFinances(finances),
      progress: progress ? parseProgress(progress, LESSONS.map((lesson) => lesson.slug)) : null,
      profile: parseProfile(profile),
      portfolio: parsePortfolio(portfolio),
      budget: parseSavedBudgets(budget),
    }
    // Vercel refuses a response over 4.5 MB, which would fail every sign-in for good: send the
    // newest chats that fit beside everything else (a few hundred bytes are left for the wrapper).
    const loaded = takeChatsWithinBytes(chats, MAX_ACCOUNT_LOAD_BYTES - 200 - jsonBytes(rest))
    return Response.json({ chats: loaded.chats, chatsTruncated: loaded.truncated, ...rest }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load account data:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't load your saved data." }, { status: 503 })
  }
}

/**
 * Deletes the signed-in account and everything synced to it. The body must be
 * { "confirm": "<the account's email>" }, so a stray click or a crafted request can't do it.
 */
export async function DELETE(request: Request) {
  const user = await requireUser()
  if ("response" in user) return user.response

  // Not counted against the sync allowance: an account that used it up must still be deletable.
  // Only { confirm: "<email>" } is expected, so anything bigger than a few hundred bytes is refused.
  const body = await readBody(request, 1024)
  if ("response" in body) return body.response
  if (!confirmsDeletion((body.value as { confirm?: unknown } | null)?.confirm, user.email)) {
    return Response.json({ error: "Type your email exactly as shown to confirm." }, { status: 400 })
  }

  try {
    // Data, then the user (which ends sessions everywhere), then data again; see lib/auth/account-deletion.ts.
    const { leftovers } = await deleteAccountEverywhere(user.email, { deleteData: deleteAccountData, deleteUser })
    console.log(JSON.stringify({ event: "account_deleted", leftovers }))
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("Failed to delete account:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't finish deleting your account. Please try again in a minute." }, { status: 503 })
  }
}
