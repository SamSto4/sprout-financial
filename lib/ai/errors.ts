import "server-only"

import Anthropic from "@anthropic-ai/sdk"

import { isSpendLimitError } from "@/lib/ai/error-kinds"

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

/** Maps Claude API failures to a user-facing message and HTTP status. Logs no user content. */
export function errorResponse(error: unknown) {
  // Checked first: the API reports a used-up spend limit as a bad request or a rate limit, and
  // neither "rephrase it" nor "wait a moment" would be true.
  if (error instanceof Anthropic.APIError && isSpendLimitError(error.status, error.message)) {
    console.error("The Anthropic spend limit for this month has been reached.")
    return jsonError("The assistant has used up its budget for this month. Please come back later.", 503)
  }
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
