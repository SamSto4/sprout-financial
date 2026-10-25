import { readJson, requireUser } from "@/lib/auth/guard"
import { chatTextLength, MAX_SYNCED_CHAT_LENGTH, parseSavedChats } from "@/lib/chat/history"
import { deleteChat, saveChat } from "@/lib/db/account-data"

// Plain ids only, so a crafted id can't become a query operator.
const CHAT_ID = /^[a-z0-9-]{1,64}$/i

export async function PUT(request: Request, context: RouteContext<"/api/account/chats/[chatId]">) {
  const user = await requireUser()
  if ("response" in user) return user.response

  const { chatId } = await context.params
  const [chat] = parseSavedChats([await readJson(request)])
  if (!CHAT_ID.test(chatId) || !chat || chat.id !== chatId) {
    return Response.json({ error: "That chat couldn't be read." }, { status: 400 })
  }
  // Far above any real chat; stops one account from filling the database (see MAX_SYNCED_CHAT_LENGTH).
  if (chatTextLength(chat) > MAX_SYNCED_CHAT_LENGTH) {
    return Response.json({ error: "That chat is too long to sync. It's still saved on this device." }, { status: 413 })
  }

  try {
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

  const { chatId } = await context.params
  if (!CHAT_ID.test(chatId)) return Response.json({ error: "Unknown chat." }, { status: 400 })

  try {
    await deleteChat(user.email, chatId)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("Failed to delete chat:", error instanceof Error ? error.message : error)
    return Response.json({ error: "Couldn't delete the chat." }, { status: 503 })
  }
}
