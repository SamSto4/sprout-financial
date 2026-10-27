import { checkDeletionCode, confirmsDeletion, deleteAccountEverywhere } from "@/lib/auth/account-deletion"
import { readBody, requireUser, syncLimitResponse } from "@/lib/auth/guard"
import { requestContextFrom } from "@/lib/auth/security-log-server"
import { freshGoogleOnlySignIn } from "@/lib/auth/session"
import { checkSecondFactor, signedInCodeDeps, twoFactorStatus } from "@/lib/auth/two-factor-server"
import { deleteUser } from "@/lib/auth/users"
import { parseSavedBudgets } from "@/lib/finance/budget-history"
import { parseImportedFinances } from "@/lib/finance/transactions"
import { chatVersions, jsonBytes, MAX_ACCOUNT_LOAD_BYTES, parseSavedChats, takeChatsWithinBytes, type SavedChat } from "@/lib/chat/history"
import { deleteAccountData, getUserData, getUserDataRow, listChats, rewriteChat, rewriteUserData } from "@/lib/db/account-data"
import { LESSONS } from "@/lib/learn/course"
import { parseProgress } from "@/lib/learn/progress"
import { parseProfile } from "@/lib/plan/profile"
import { parsePortfolio } from "@/lib/portfolio/holdings"
import { changedByParsing, chatsChangedByParsing } from "@/lib/sync/clean-copies"

/**
 * Writes back stored chats and imports that parsing changed: ones synced before card and account
 * numbers were masked. Sync uploads only by version, and masking changes no version, so without
 * this the account's copy would keep the full numbers (lib/sync/clean-copies.ts). Each write lands
 * only while the stored copy is still the version read. A failure is logged and the load goes on.
 */
async function writeBackCleaned(
  email: string,
  chats: { stored: unknown[]; parsed: SavedChat[] },
  finances: { row: { value: unknown; updatedAt: Date | null } | null; parsed: unknown }
) {
  const writes = chatsChangedByParsing(chats.stored, chats.parsed).map((chat) => rewriteChat(email, chat))
  if (finances.row && changedByParsing(finances.row.value, finances.parsed)) {
    writes.push(rewriteUserData(email, "finances", finances.row.updatedAt, finances.parsed))
  }
  if (writes.length === 0) return
  const failed = (await Promise.allSettled(writes)).filter((result) => result.status === "rejected").length
  console.log(JSON.stringify({ event: "synced_copies_cleaned", writes: writes.length, failed }))
}

// Everything the signed-in user has synced, for merging into the browser on sign-in.
export async function GET() {
  const user = await requireUser()
  if ("response" in user) return user.response
  const limited = await syncLimitResponse(user.email, "accountLoad")
  if (limited) return limited

  try {
    const [storedChats, financesRow, progress, profile, portfolio, budget] = await Promise.all([
      listChats(user.email),
      getUserDataRow(user.email, "finances"),
      getUserData(user.email, "progress"),
      getUserData(user.email, "profile"),
      getUserData(user.email, "portfolio"),
      getUserData(user.email, "budget"),
    ])
    // Parsed here as well as in the browser, so numbers in older copies are masked on the way out.
    const chats = parseSavedChats(storedChats)
    const finances = parseImportedFinances(financesRow?.value ?? null)
    await writeBackCleaned(user.email, { stored: storedChats, parsed: chats }, { row: financesRow, parsed: finances })
    const rest = {
      finances,
      progress: progress ? parseProgress(progress, LESSONS.map((lesson) => lesson.slug)) : null,
      profile: parseProfile(profile),
      portfolio: parsePortfolio(portfolio),
      budget: parseSavedBudgets(budget),
      // Every chat's last update, including any left out below, so a browser holding an older copy
      // of a left-out chat doesn't upload it over this one (serverChatVersions in lib/sync/merge.ts).
      chatVersions: chatVersions(chats),
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
 * { "confirm": "<the account's email>" }, so a stray click or a crafted request can't do it, plus
 * "code" (from the authenticator app, or a recovery code) when the account has two-step
 * verification on, so someone who only holds a signed-in browser can't either. Codes are limited
 * per account (twoFactorCode) and each wrong one is logged; a Google-only account that logged in
 * with Google in the last few minutes needs none (lib/auth/two-factor-code.ts).
 */
export async function DELETE(request: Request) {
  const user = await requireUser()
  if ("response" in user) return user.response

  // Not counted against the sync allowance: an account that used it up must still be deletable.
  // Only { confirm, code } is expected, so anything bigger than a few hundred bytes is refused.
  const body = await readBody(request, 1024)
  if ("response" in body) return body.response
  if (!confirmsDeletion((body.value as { confirm?: unknown } | null)?.confirm, user.email)) {
    return Response.json({ error: "Type your email exactly as shown to confirm." }, { status: 400 })
  }

  try {
    const second = await checkDeletionCode(body.value, {
      twoFactorEnabled: async () => (await twoFactorStatus(user.email)).enabled,
      codeWaived: () => freshGoogleOnlySignIn(user.email),
      code: signedInCodeDeps(user.email, "delete", requestContextFrom(request.headers), (code) => checkSecondFactor(user.email, code)),
    })
    if (!second.ok) {
      return Response.json(
        { error: second.error, ...(second.needsCode ? { needsCode: true } : {}) },
        {
          status: second.status,
          headers: { "Cache-Control": "no-store", ...(second.retryAfterSeconds ? { "Retry-After": String(second.retryAfterSeconds) } : {}) },
        }
      )
    }
  } catch (error) {
    console.error("Couldn't check two-step verification before deleting:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't delete your account just now. Please try again in a minute." }, { status: 503 })
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
