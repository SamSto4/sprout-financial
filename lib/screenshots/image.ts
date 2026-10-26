// Rules for screenshot images, shared by the browser (which shrinks and re-encodes each picture
// before upload) and the server (which checks what arrives). Pure and tested with `node --test`.

/** What a screenshot is read for: the Dashboard's transactions or the Portfolio page's holdings. */
export const SCREENSHOT_KINDS = ["transactions", "holdings"] as const
export type ScreenshotKind = (typeof SCREENSHOT_KINDS)[number]

export function isScreenshotKind(value: unknown): value is ScreenshotKind {
  return (SCREENSHOT_KINDS as readonly unknown[]).includes(value)
}

/** What went wrong with a screenshot as a whole, chosen by the model from a fixed list. */
export const SCREENSHOT_PROBLEMS = ["none", "not_financial", "wrong_kind", "unreadable"] as const
export type ScreenshotProblem = (typeof SCREENSHOT_PROBLEMS)[number]

/** What to tell the person when a screenshot gave no rows. Worded here, not by the model. */
export function problemMessage(kind: ScreenshotKind, problem: ScreenshotProblem, label: string): string {
  if (problem === "wrong_kind") {
    return kind === "transactions"
      ? `${label} shows investments. Add it on the Portfolio page instead.`
      : `${label} shows transactions. Add it on the Dashboard instead.`
  }
  if (problem === "not_financial") {
    return `${label} doesn't look like a ${kind === "transactions" ? "bank or card" : "brokerage or retirement account"} screen.`
  }
  if (problem === "unreadable") return `${label} was too blurry, small or cut off to read. Try a sharper screenshot.`
  return `No ${kind} found in ${label.toLowerCase()}.`
}

/** What the server accepts. The browser always sends JPEG; PNG and WebP are allowed so a direct
 * client can send a lossless screenshot. */
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number]

/**
 * The largest image the server takes, decoded. Base64 adds a third, so a request stays under
 * Vercel's 4.5 MB body limit (https://vercel.com/docs/functions/limitations).
 */
export const MAX_SCREENSHOT_BYTES = 3_000_000
/** The request body cap for one screenshot: the base64 image plus a little JSON around it. */
export const MAX_SCREENSHOT_REQUEST_BYTES = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4_096

/** A picture straight off a phone can be large; anything bigger than this isn't a screenshot. */
export const MAX_ORIGINAL_BYTES = 25_000_000

/** Screenshots picked at once. Each is read with its own request. */
export const MAX_SCREENSHOTS = 6

// Claude reads images in 28×28-pixel patches. Current models take up to 2,576 px on the long edge
// and 4,784 patches; anything larger is shrunk on Anthropic's side anyway, so sending more only
// costs upload time (https://platform.claude.com/docs/en/build-with-claude/vision).
const MAX_LONG_EDGE = 2576
const MAX_PATCHES = 4784
const PATCH = 28

function patches(width: number, height: number) {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/** The largest size, keeping the aspect ratio, that fits Claude's image limits. Never enlarges. */
export function fitScreenshot(width: number, height: number): { width: number; height: number } {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 }
  let scale = Math.min(1, MAX_LONG_EDGE / Math.max(width, height), Math.sqrt((MAX_PATCHES * PATCH * PATCH) / (width * height)))
  let fitted = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
  // Rounding up to whole patches can tip it just over; step down until it fits.
  while (patches(fitted.width, fitted.height) > MAX_PATCHES) {
    scale *= 0.98
    fitted = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
  }
  return fitted
}

export type ScreenshotUpload = { mediaType: ScreenshotType; data: string }

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** The first bytes each format starts with, so a renamed file can't pass as an image. */
function startsLike(bytes: number[], mediaType: ScreenshotType) {
  const at = (offset: number, expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte)
  if (mediaType === "image/jpeg") return at(0, [0xff, 0xd8, 0xff])
  if (mediaType === "image/png") return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]) // "RIFF" … "WEBP"
}

/**
 * Checks an uploaded screenshot from a request body: a supported type, valid base64, under the
 * size cap, and bytes that really are that kind of image. Says why when it isn't.
 */
export function parseScreenshotUpload(raw: unknown): { ok: true; image: ScreenshotUpload } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Send one image." }
  const { mediaType, data } = raw as Record<string, unknown>
  if (typeof mediaType !== "string" || !(SCREENSHOT_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, error: "Use a JPEG, PNG or WebP image." }
  }
  if (typeof data !== "string" || data.length < 16 || data.length % 4 !== 0 || !BASE64.test(data)) {
    return { ok: false, error: "The image didn't arrive intact. Try again." }
  }
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  if ((data.length / 4) * 3 - padding > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "That image is too large. Try a smaller screenshot." }
  }
  const head = [...atob(data.slice(0, 16))].map((char) => char.charCodeAt(0))
  if (!startsLike(head, mediaType as ScreenshotType)) {
    return { ok: false, error: "That file isn't an image Sprout can read." }
  }
  return { ok: true, image: { mediaType: mediaType as ScreenshotType, data } }
}
