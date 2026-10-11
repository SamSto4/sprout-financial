import "server-only"

import Anthropic from "@anthropic-ai/sdk"

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

/** Maps Claude API failures to a user-facing message and HTTP status. Logs no user content. */
export function errorResponse(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("Anthropic credentials were rejected:", error.message)
    return jsonError("The assistant isn't configured correctly yet. Please try again later.", 503)
  }
  if (error instanceof Anthropic.RateLimitError) {
    return jsonError("The assistant is getting a lot of questions right now. Please wait a moment and try again.", 429)
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("Anthropic rejected the request:", error.message)
    return jsonError("Something about that message couldn't be processed. Try rephrasing it.", 400)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    console.error("Couldn't reach the Anthropic API:", error.message)
    return jsonError("The assistant is unreachable right now. Please try again shortly.", 503)
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}:`, error.message)
    return jsonError("The assistant ran into a problem. Please try again.", 502)
  }
  console.error("Unexpected assistant error:", error instanceof Error ? error.message : error)
  return jsonError("Something went wrong. Please try again.", 500)
}
