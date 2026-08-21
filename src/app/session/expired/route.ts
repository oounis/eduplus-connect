import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * A session cookie that verifies but points at a user who no longer exists
 * (database reseeded, account deleted) used to loop forever: /login saw a
 * valid cookie and sent the browser to /dashboard, /dashboard found no user
 * and sent it back to /login. Pages cannot clear cookies, route handlers can:
 * this one drops the stale cookie and lands on the login page.
 */
export async function GET(request: NextRequest) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?expired=1";
  return NextResponse.redirect(url);
}
