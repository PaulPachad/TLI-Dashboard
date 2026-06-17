import type { NextConfig } from "next";

if (process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Allow 127.0.0.1 as a dev origin so the visual smoke test (which binds to
  // 127.0.0.1 to avoid DNS resolution) is not blocked by the cross-origin dev
  // resource protection introduced in Next.js 15+.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
