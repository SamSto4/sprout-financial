import { isAgentConfigured, SCREENSHOT_MODEL } from "@/lib/ai/client"
import { errorResponse, jsonError } from "@/lib/ai/errors"
import { readScreenshot, ScreenshotError } from "@/lib/ai/screenshot-reader"
import { spendingLimitResponse } from "@/lib/ai/spend-server"
import { readJsonBody } from "@/lib/http/body"
import { rateLimitResponse } from "@/lib/rate-limit/server"
import { isScreenshotKind, MAX_SCREENSHOT_REQUEST_BYTES, parseScreenshotUpload } from "@/lib/screenshots/image"

// Reads one screenshot of a bank or brokerage screen and returns the rows found, for the browser
// to show in a review table. Nothing is saved here: the image lives only for this request, and the
// rows are added to the user's data in the browser once they confirm them.
export async function POST(request: Request) {
  const body = await readJsonBody(request, MAX_SCREENSHOT_REQUEST_BYTES)
  if (!body.ok) {
    return body.reason === "too-large"
      ? jsonError("That image is too large. Try a smaller screenshot.", 413)
      : jsonError("Request body must be valid JSON.", 400)
  }

  const { kind, image } = (body.value ?? {}) as { kind?: unknown; image?: unknown }
  if (!isScreenshotKind(kind)) return jsonError('kind must be "transactions" or "holdings".', 400)
  const upload = parseScreenshotUpload(image)
  if (!upload.ok) return jsonError(upload.error, 400)

  if (!isAgentConfigured()) {
    console.error("No API key: set CLAUDE_API_KEY in .env")
    return jsonError("Screenshot import isn't set up yet. Please try again later.", 503)
  }

  const overBudget = await spendingLimitResponse(SCREENSHOT_MODEL)
  if (overBudget) return overBudget

  const limited = await rateLimitResponse("screenshot", request)
  if (limited) return limited

  try {
    const result = await readScreenshot(kind, upload.image, { signal: request.signal })
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ScreenshotError) return jsonError(error.message, 502)
    return errorResponse(error)
  }
}
