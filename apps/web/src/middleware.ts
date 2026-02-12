import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "aps_session";

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (authCookie === "1") {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/experiments/:path*", "/jobs/:path*"],
};
