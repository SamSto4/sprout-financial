// Recognizes API failures that deserve their own message for the user.
// Kept free of framework and SDK imports so it can be unit-tested with `node --test`.

/**
 * True when the API turned a request down because the monthly spend limit is used up: the limit
 * set on the workspace or organization in the Claude Console, or the usage tier's own cap.
 * Retrying doesn't help until the limit is raised or the month ends.
 */
export function isSpendLimitError(status: number | undefined, message: string) {
  return (status === 400 || status === 429) && /reached your (specified )?(workspace )?API usage limits/i.test(message)
}

/**
 * True when a failed call may still have been billed: it was stopped (the user left the page) or
 * the connection was lost, so no response said whether the model ran. A failure the API answered
 * with an HTTP status (a request turned down, an overloaded or failed server) isn't billed.
 */
export function mayHaveBeenBilled(error: unknown): boolean {
  return typeof (error as { status?: unknown } | null)?.status !== "number"
}
