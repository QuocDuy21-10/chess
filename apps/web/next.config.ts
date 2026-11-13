import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/csp.ts";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy({
      serverUrl: process.env.NEXT_PUBLIC_SERVER_URL,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

// The engine's names carry Stockfish's version and never change in place (src/engine/files.test.ts).
// A changed sound reaches returning players within a week.
const cacheHeaders = [
  { source: "/engine/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  {
    source: "/audio/:file*",
    headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Production only: `next dev` needs eval for React's error overlay, which this policy forbids.
  async headers() {
    const security = process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: securityHeaders }] : [];
    return [...cacheHeaders, ...security];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Uploads source maps only when the build has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT (set them on Vercel).
export default withSentryConfig(nextConfig, { silent: !process.env.CI, telemetry: false });
