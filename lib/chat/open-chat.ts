// Whether the conversation open on the Assistant page may still be saved. The page keeps it in
// memory (components/chat.tsx) and saves the whole of it after every reply, so it must not outlive
// what it was based on:
// - this browser's copy of the account's data was cleared (sign-out, account deletion, a session
//   that ended on another device, a copy another account left behind; lib/sync/account-sync.ts),
//   in this tab or another. Saving it then would write that account's conversation back with no
//   owner tag, and the next account to sign in on this device would get it.
// - or the chat had been saved and has since been deleted (in another tab, or here while a reply
//   was still arriving). Saving it then would bring the deleted chat back, and sync would upload it.
// Kept free of framework imports so it can be unit-tested with `node --test`.

/**
 * What the open conversation is based on. `cleared`: the marker that changes whenever this
 * browser's copy is cleared (copyClearedStore in lib/stores.ts). `saved`: whether the chat is
 * among the saved chats.
 */
export type ChatBasis = { cleared: string | null; saved: boolean }

/** The open chat, by id, with what its conversation is based on. */
export type OpenChat = ChatBasis & { id: string }

/** Whether a conversation based on `then` may be saved `now`: not after a clear, nor once a saved chat is gone. */
export function maySaveChat(then: ChatBasis, now: ChatBasis): boolean {
  if (now.cleared !== then.cleared) return false
  return now.saved || !then.saved
}

/**
 * Follows the open chat from one render to the next. `seen` is what its conversation was based
 * on (null before the first look). Returns what to remember, and `reset: true` when the
 * conversation on screen must give way to a new chat. A chat that gets saved for the first time
 * is remembered as saved, so its later removal is noticed.
 */
export function followOpenChat(seen: OpenChat | null, now: OpenChat): { seen: OpenChat; reset: boolean } {
  if (!seen || seen.id !== now.id) return { seen: now, reset: false }
  if (!maySaveChat(seen, now)) return { seen, reset: true }
  return { seen: now.saved && !seen.saved ? now : seen, reset: false }
}
