import { readBody, requireUser, syncLimitResponse } from "@/lib/auth/guard"
import { CHAT_ID_PATTERN, chatTextLength, MAX_SYNCED_CHAT_LENGTH, parseSavedChats } from "@/lib/chat/history"
import { deleteChat, saveChat } from "@/lib/db/account-data"

export async function PUT(request: Request, context: RouteContext<"/api/account/chats/[chatId]">) {
  const user = await requireUser()
  if ("response" in user) return user.response

  const limited = await syncLimitResponse(user.email, "accountSync")
  if (limited) return limited

  const { chatId } = await context.params
  const body = await readBody(request)
  if ("response" in body) return body.response
  const [chat] = parseSavedChats([body.value])
  // Plain ids only (CHAT_ID_PATTERN), so a crafted id can't become a query operator.
  if (!CHAT_ID_PATTERN.test(chatId) || !chat || chat.id !== chatId) {
    return Response.json({ error: "That chat couldn't be read." }, { status: 400 })
  }
  // Far above any real chat; stops one account from filling the database (see MAX_SYNCED_CHAT_LENGTH).
  if (chatTextLength(chat) > MAX_SYNCED_CHAT_LENGTH) {
    return Response.json({ error: "That chat is too long to sync. It's still saved on this device." }, { status: 413 })
  }

  try {
    // A copy older than the account's isn't saved (saveChat); that's still a success for the
    // browser: the newer copy reaches it with the next load.
    await saveChat(user.email, chat)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("Failed to save chat:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't save the chat." }, { status: 503 })
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/account/chats/[chatId]">) {
  const user = await requireUser()
  if ("response" in user) return user.response

  const limited = await syncLimitResponse(user.email, "accountSync")
  if (limited) return limited

  const { chatId } = await context.params
  if (!CHAT_ID_PATTERN.test(chatId)) return Response.json({ error: "Unknown chat." }, { status: 400 })

  try {
    await deleteChat(user.email, chatId)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("Failed to delete chat:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't delete the chat." }, { status: 503 })
  }
}
