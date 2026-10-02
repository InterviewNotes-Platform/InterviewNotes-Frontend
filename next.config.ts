import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Unset everywhere but the e2e suite, which builds a preview next to the production build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
