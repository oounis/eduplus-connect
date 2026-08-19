import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships a native module and its own README/LICENSE files; webpack must
  // not try to bundle any of it. Node loads these from node_modules at runtime.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@libsql/client",
    "libsql",
  ],
  // Other Node projects live above this folder; pin the root so Next does not
  // pick up an unrelated lockfile from the home directory.
  outputFileTracingRoot: __dirname,
  experimental: {
    // Server Actions are used for every mutation in this app.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
