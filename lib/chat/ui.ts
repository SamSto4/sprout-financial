// Small rules behind the chat screen: when to keep following a reply, when to show the character
// count, and what to offer after a failed question.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { formatNumber } from "../format.ts"

type ScrollBox = { scrollTop: number; scrollHeight: number; clientHeight: number }

/** How close to the bottom (in pixels) a reader scrolling down has to come to follow the reply again. */
export const NEAR_BOTTOM_PX = 64

/** True when a scroll box is at, or within `threshold` pixels of, its bottom. */
export function isNearBottom(box: ScrollBox, threshold = NEAR_BOTTOM_PX) {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= threshold
}

/**
 * Whether the view should keep following new text, given where the box was last seen
 * (`previousTop`) and whether it was following (`pinned`). Checked on every scroll event and
 * again before following new text, because the scroll event can arrive after the next piece of
 * the reply.
 * - At the bottom: follow. That includes a box the browser moved up because its content shrank.
 * - Moved up and no longer at the bottom: stop, however small the move. Browsers animate a wheel
 *   scroll, and its first few pixels must not be pulled back down by the next piece of text.
 * - Moved down to within NEAR_BOTTOM_PX of the bottom: follow again.
 * - Otherwise nothing changes.
 */
export function nextPinned(box: ScrollBox, previousTop: number, pinned: boolean) {
  if (isNearBottom(box, 1)) return true
  if (box.scrollTop < previousTop - 1) return false
  if (box.scrollTop > previousTop + 1 && isNearBottom(box)) return true
  return pinned
}

/** The count appears once a message reaches this share of the limit. */
export const COUNT_FROM = 0.9

/** The character count shown in the message box near or over the limit, or null while it isn't needed. */
export function lengthHint(length: number, max: number): { text: string; over: boolean } | null {
  if (length < Math.ceil(max * COUNT_FROM)) return null
  const over = length > max
  return { text: `${formatNumber(length)} / ${formatNumber(max)}${over ? " · too long to send" : ""}`, over }
}

/**
 * What the error banner offers after a question fails. `status` is the HTTP status, or null when
 * the request never got an answer or the connection dropped mid-reply.
 * - "retry": a temporary problem; sending the same question again may work.
 * - "new-chat": the conversation is over the size limits (400, 413); only a new chat helps.
 * - "none": rate limited or out of budget (429, 503); the message says when to come back.
 */
export function failureAction(status: number | null): "retry" | "new-chat" | "none" {
  if (status === null) return "retry"
  if (status === 429 || status === 503) return "none"
  if (status === 400 || status === 413) return "new-chat"
  return "retry"
}
