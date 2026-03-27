import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import {
  LAST_TENANT_COOKIE,
  lastTenantCookieOptions,
} from "./lib/tenant-cookie";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    return updateSession(request);
  }

  // For page routes: run session refresh AND intl routing.
  // The session response carries refreshed cookies — copy them into the intl
  // response so the browser receives updated tokens on every navigation.
  const sessionRes = await updateSession(request);
  const intlRes = intlMiddleware(request);

  sessionRes.headers.getSetCookie().forEach((cookie) => {
    intlRes.headers.append("Set-Cookie", cookie);
  });

  const tenantSeg = path.match(/^\/(\d+)(?:\/|$)/);
  if (tenantSeg) {
    intlRes.cookies.set(LAST_TENANT_COOKIE, tenantSeg[1], lastTenantCookieOptions);
  }

  return intlRes;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
