import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Other Node projects live above this folder; pin the root so Next does not
  // pick up an unrelated lockfile from the home directory.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Server Actions are used for every mutation in this app.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
