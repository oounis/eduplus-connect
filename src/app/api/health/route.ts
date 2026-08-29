import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Never cached: a cached health check is a health check that lies.
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness for nginx, the container healthcheck and uptime
 * monitoring.
 *
 * It touches the database on purpose. A process that is running but cannot
 * reach Postgres is not serving anyone, and a check that only proves Node is
 * alive would keep a broken instance in the load balancer.
 *
 * Deliberately says nothing about versions, hostnames or connection strings:
 * it is the one route reachable without a session.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", database: "up", latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // The reason is logged, not returned — an error page is not a place to
    // describe the database to the internet.
    console.error("health check: database unreachable");
    return NextResponse.json(
      { status: "error", database: "down" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
