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
