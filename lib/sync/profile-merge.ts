// How this browser's plan (About you) and the account's are combined on sign-in, and whether that
// should ask again before About you is used here.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { MAX_FOCUS, type FocusId } from "../plan/focus.ts"
import {
  EMPTY_PROFILE,
  hasPlanDetails,
  parseProfile,
  PROFILE_FIELDS,
  type InvestorProfile,
  type ProfileMeta,
  type SharingReason,
} from "../plan/profile.ts"

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Canonical text of a profile (field order as parsed), for comparing and for sync versions. */
export function profileVersion(profile: InvestorProfile | null): string {
  const parsed = profile ? parseProfile(profile) : null
  return parsed ? JSON.stringify(parsed) : ""
}

/** Both sides' topics, `lead`'s first, each once, at most MAX_FOCUS. */
function combineFocus(lead: InvestorProfile, follow: InvestorProfile): FocusId[] {
  return [...new Set([...(lead.focus ?? []), ...(follow.focus ?? [])])].slice(0, MAX_FOCUS)
}

/** 1 ms after a stored save time (an ISO string), or the same text if it can't be read. */
function justAfter(updatedAt: string): string {
  const time = Date.parse(updatedAt)
  return Number.isFinite(time) && time < 253402300799999 ? new Date(time + 1).toISOString() : updatedAt
}

function hasLocation(profile: InvestorProfile) {
  return Boolean(profile.country.trim() || profile.countryCode || profile.currency)
}

/**
 * Both sides' plan, combined on sign-in. A plan with details (hasPlanDetails: age, goal, horizon,
 * quiz, income, essentials, savings, debts, match or accounts) is kept whole: when both sides have
 * one, the one saved later wins, defaults included, as it always has (mergeNewest's rule, by
 * `updatedAt`). A profile without details (only topics, a country or currency, or an experience:
 * a topic chip, Remember, About you's Clear) never replaces one that has them, whichever is newer.
 * Topics from both sides are kept, each once and at most MAX_FOCUS, the newer side's first. When a
 * partial side is involved, the other side also fills one gap in the one kept, never overwriting:
 * its country, code and currency when the kept side has none of them. Field stamps (`meta`) come
 * along for display only; they decide nothing here. Returns `local` or `remote` itself when the
 * result is the same as that side. A result that is neither is dated 1 ms after the later of the
 * two, so every other device takes it as the newest copy on its next load; dated like the side it
 * kept, a device still holding that side would tie, keep its own copy and upload it back over the
 * combined one, and a filled-in country or topic would flip between devices.
 */
export function mergeProfiles(local: InvestorProfile | null, remote: InvestorProfile | null): InvestorProfile | null {
  if (!local?.updatedAt) return remote ?? local
  if (!remote?.updatedAt) return local

  const localNewer = local.updatedAt >= remote.updatedAt
  const newer = localNewer ? local : remote
  const older = localNewer ? remote : local
  const newerFull = hasPlanDetails(newer)
  const olderFull = hasPlanDetails(older)
  // The side kept whole, and the other one, which adds its topics (and fills gaps when partial).
  const keep = newerFull || !olderFull ? newer : older
  const other = keep === newer ? older : newer

  const merged: InvestorProfile = { ...keep }
  const meta: ProfileMeta = { ...(keep.meta ?? {}) }

  const focus = combineFocus(newer, older)
  delete merged.focus
  if (focus.length > 0) {
    merged.focus = focus
    // Where the topics came from: the kept side's own stamp while they're its own, else the stamp
    // of the newer side if it has topics.
    const stamp = same(focus, keep.focus ?? []) ? keep.meta?.focus : ((newer.focus?.length ? newer.meta?.focus : undefined) ?? older.meta?.focus)
    delete meta.focus
    if (stamp) meta.focus = stamp
  }

  if (!(newerFull && olderFull)) {
    if (!hasLocation(keep) && hasLocation(other)) {
      merged.country = other.country
      delete merged.countryCode
      delete merged.currency
      if (other.countryCode) merged.countryCode = other.countryCode
      if (other.currency) merged.currency = other.currency
      for (const field of ["country", "countryCode", "currency"] as const) {
        const stamp = other.meta?.[field]
        if (stamp) meta[field] = stamp
      }
    }
  }

  delete merged.meta
  if (Object.keys(meta).length > 0) merged.meta = meta

  // In parsed field order, so this browser's copy reads exactly as the account's will.
  const canonical = parseProfile(merged) ?? merged
  const version = JSON.stringify(canonical)
  if (version === profileVersion(local)) return local
  if (version === profileVersion(remote)) return remote
  return { ...canonical, updatedAt: justAfter(newer.updatedAt) }
}

export type SignInSharing = {
  /** Why About you is on here (sharePlanReasonStore). */
  reason: SharingReason | null
  /** This browser's plan before sign-in, and what the merge makes it. */
  profileBefore: InvestorProfile | null
  profileAfter: InvestorProfile | null
  /** This browser's finished lessons before sign-in, and after merging the account's. */
  lessonsBefore: readonly string[]
  lessonsAfter: readonly string[]
  /** Whether About you includes finished lessons here (shareLessonsStore). */
  lessonsShared: boolean
}

/**
 * Whether sign-in should put this device's About you back to undecided, so the banner asks before
 * anything from the account is sent: About you was turned on here only by a save of one field (a
 * topic chip, Remember, a quick answer), which on a shared browser may have been someone else's
 * tap, and the merge brings something About you would send that this browser didn't have: plan
 * details or topics, or finished lessons while those are included. A choice on the banner or a
 * switch, a My plan save, or a reason not recorded (turned on before reasons were kept) stands.
 */
export function asksAgainAfterMerge({ reason, profileBefore, profileAfter, lessonsBefore, lessonsAfter, lessonsShared }: SignInSharing): boolean {
  if (reason === null || reason === "choice" || reason === "plan") return false
  if (lessonsShared) {
    const had = new Set(lessonsBefore)
    if (lessonsAfter.some((slug) => !had.has(slug))) return true
  }
  if (!profileAfter) return false
  const before = profileBefore ?? EMPTY_PROFILE
  return PROFILE_FIELDS.some((field) => !same(before[field], profileAfter[field]))
}
