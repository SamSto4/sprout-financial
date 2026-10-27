import { openTokenLink } from "@/lib/auth/token-link"

// The link in sign-up confirmation emails: moves the token into a cookie and shows /verify-email
// without it in the address (lib/auth/token-link.ts).
export function GET(request: Request) {
  return openTokenLink(request.url, "verify", process.env.NODE_ENV === "production")
}
