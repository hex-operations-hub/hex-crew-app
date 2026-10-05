import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shopify's app proxy forwards /apps/crew as /proxy/. Next's default
  // redirect to /proxy would be sent back to the browser as a relative
  // Location and land on the store's (non-existent) /proxy page.
  skipTrailingSlashRedirect: true,
  // The portal templates are read from disk at request time.
  outputFileTracingIncludes: {
    "/proxy/[[...path]]": ["./portal/**/*"],
  },
};

export default nextConfig;
