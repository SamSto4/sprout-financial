import type { NextConfig } from "next";

import { headerRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // Don't advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  // Security headers on every route; what each one does is in lib/security-headers.ts. The
  // Content-Security-Policy here is only for the paths proxy.ts skips; every other response gets
  // the per-request one from the proxy, so no response carries two.
  async headers() {
    return headerRules();
  },
};

export default nextConfig;
