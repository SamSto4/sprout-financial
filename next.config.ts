import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Security headers on every route; what each one does is in lib/security-headers.ts. On pages,
  // proxy.ts replaces this Content-Security-Policy with the stricter per-request one.
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
