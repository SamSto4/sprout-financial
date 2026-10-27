import { openTokenLink } from "@/lib/auth/token-link"

// The link in password reset emails: moves the token into a cookie and shows /reset-password
// without it in the address (lib/auth/token-link.ts).
export function GET(request: Request) {
  return openTokenLink(request.url, "reset", process.env.NODE_ENV === "production")
}
