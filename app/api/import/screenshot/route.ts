import { isAgentConfigured, SCREENSHOT_MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { readScreenshot, ScreenshotError } from "@/lib/ai/screenshot-reader"
import { spendingLimitResponse } from "@/lib/ai/spend-server"
import { readJsonBody } from "@/lib/http/body"
import { rateLimitResponse } from "@/lib/rate-limit/server"
import { isScreenshotKind, MAX_SCREENSHOT_REQUEST_BYTES, parseScreenshotUploads } from "@/lib/screenshots/image"

// How long one read may run, in seconds. The longest is a tall capture in 10 pieces with up to
// 16,000 output tokens (MAX_TOKENS_PIECES in lib/ai/screenshot-reader.ts). In the screenshot eval,
// Haiku wrote a 9-piece month capture's 116 rows (about 6,200 tokens) in 22-25 s, roughly 270
// tokens a second, so a full 16,000 would take about a minute; 150 s leaves room for the API
// running at less than half that speed. Without it, the platform's default applies, which can be
// as short as 10 s.
export const maxDuration = 150

// The read is stopped a little before the platform would end the function, so its cost is still
// counted toward the spending limit (screenshot-reader.ts counts a stopped call as a full read).
const READ_DEADLINE_MS = (maxDuration - 10) * 1000

// Reads one screenshot of a bank or brokerage screen and returns the rows found, for the browser
// to show in a review table. A tall capture arrives as several pieces (planScreenshot in
// lib/screenshots/image.ts), read together in one model call; each piece counts as one screenshot
// against the rate limits. Nothing is saved here: the images live only for this request, and the
// rows are added to the user's data in the browser once they confirm them.
export async function POST(request: Request) {
  const body = await readJsonBody(request, MAX_SCREENSHOT_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? jsonError("That image is too large. Try a smaller screenshot.", 413)
      : jsonError("Request body must be valid JSON.", 400)
  }

  // `image` (one image) is what pages loaded before tall captures were cut into pieces send.
  const { kind, images, image } = (body.value ?? {}) as { kind?: unknown; images?: unknown; image?: unknown }
  if (!isScreenshotKind(kind)) return jsonError('kind must be "transactions" or "holdings".', 400)
  const upload = parseScreenshotUploads(images ?? image)
  if (!upload.ok) return jsonError(upload.error, 400)

  if (!isAgentConfigured()) {
    console.error("No API key: set CLAUDE_API_KEY in .env")
    return jsonError("Screenshot import isn't set up yet. Please try again later.", 503)
  }

  const overBudget = await spendingLimitResponse(SCREENSHOT_MODEL)
  if (overBudget) return overBudget

  // Each piece costs about what one full-size screenshot does, so each counts as one.
  const limited = await rateLimitResponse("screenshot", request, upload.images.length)
  if (limited) return limited

  const deadline = AbortSignal.timeout(READ_DEADLINE_MS)
  try {
    const result = await readScreenshot(kind, upload.images, { signal: AbortSignal.any([request.signal, deadline]) })
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ScreenshotError) return jsonError(error.message, 502)
    if (deadline.aborted && !request.signal.aborted) return jsonError("That screenshot took too long to read. Please try again, or try a shorter one.", 504)
    return errorResponse(error)
  }
}
