import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Emits .next/standalone: a self-contained server with only the node_modules
  // it actually reaches. It is what the Docker image copies, and it is the
  // difference between a ~200 MB image and a ~1.5 GB one.
  output: "standalone",

  // Prisma loads its query engine from node_modules at runtime; webpack must
  // not try to bundle the native binary.
  serverExternalPackages: ["@prisma/client"],

  // Other Node projects live above this folder; pin the root so Next does not
  // pick up an unrelated lockfile from the home directory.
  outputFileTracingRoot: __dirname,

  // Nothing is gained by telling the internet which framework this is.
  poweredByHeader: false,

  experimental: {
    // Server Actions are used for every mutation in this app.
    serverActions: { bodySizeLimit: "2mb" },
  },

  /**
   * Security headers.
   *
   * Set here rather than only in nginx so they survive however the app is
   * fronted — a misconfigured proxy should not silently drop them. nginx adds
   * HSTS on top, because that one belongs to whoever terminates TLS.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The app is a private school system; it has no business being
          // framed by another site.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Everything the app serves is same-origin: no CDN, no third-party
          // scripts, no external fonts. 'unsafe-inline' on styles is Tailwind's
          // injected styles; 'unsafe-inline' on scripts is required by Next's
          // hydration bootstrap.
          //
          // 'unsafe-eval' is added in DEVELOPMENT ONLY: Next's dev server
          // compiles with eval-based source maps and hot reload, so without it
          // no client JavaScript runs at all — which does not look like a CSP
          // problem, it looks like every form silently failing to submit.
          // Production never needs it, and never gets it.
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
