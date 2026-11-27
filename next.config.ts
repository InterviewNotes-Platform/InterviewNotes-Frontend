import type { NextConfig } from "next";
import { compatibilityRedirects } from "./src/lib/legacy-redirects";
import { publicCacheHeaders } from "./src/lib/public-cache";

const nextConfig: NextConfig = {
  // Unset everywhere but the e2e suite, which builds a preview next to the production build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Temporary redirects declared here run before rendering and read no data (S6-RTE-1).
  redirects: async () => compatibilityRedirects(),
  // Practice pages are per learner (P9-R-PRV-06): no shared cache, CDN or browser history cache may keep them. They carry no learner text
  // (the browser fills them from the API), so this is the second lock, not the only one.
  headers: async () => [
    { source: "/practice/attempts/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    { source: "/practice/history", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ...publicCacheHeaders(),
  ],
};

export default nextConfig;
