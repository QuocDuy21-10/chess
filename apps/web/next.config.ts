import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static files only: ./Caddyfile serves them, with the headers scripts/caddy-headers.ts writes.
  output: "export",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Uploads source maps only when the build has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT.
export default withSentryConfig(nextConfig, { silent: !process.env.CI, telemetry: false });
