import type { NextConfig } from "next";
import { compatibilityRedirects } from "./src/lib/legacy-redirects";

const nextConfig: NextConfig = {
  // Unset everywhere but the e2e suite, which builds a preview next to the production build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Temporary redirects declared here run before rendering and read no data (S6-RTE-1).
  redirects: async () => compatibilityRedirects(),
};

export default nextConfig;
