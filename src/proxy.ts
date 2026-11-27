import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";
import { getEnv } from "@/server/env";

/** First line of defence: everything but the login page needs a session. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const env = getEnv();
  const keys = { secret: env.SESSION_SECRET, passwordHash: env.AUTH_PASSWORD_HASH };
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, keys)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
