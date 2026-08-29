import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Coarse gate: anything outside /login needs a valid session cookie.
 * Per-module rights are enforced again in each page and server action.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except the login page, quick attendance, the health check,
     * Next internals, the favicon and static assets.
     *
     * api/health is exempt deliberately: it is polled by nginx, the container
     * healthcheck and uptime monitoring, none of which hold a session. Gating
     * it would report a perfectly healthy server as down. It returns no
     * information beyond "up" or "down".
     *
     * /quick is exempt because it is the point of it — a teacher reaches the
     * period register from a shared classroom device without a full sign-in.
     * It is NOT unauthenticated: those pages check their own signed cookie
     * (lib/quick-session.ts) and show nothing without it. Only the list of
     * teacher names is public; the roster is behind the PIN.
     */
    "/((?!login|quick|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
