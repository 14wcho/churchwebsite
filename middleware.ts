import { NextRequest, NextResponse } from "next/server";

// Protects admin pages and data-mutating APIs with a single shared password.
// If ADMIN_PASSWORD isn't set (e.g. running locally on your own machine), the
// gate is skipped entirely — there's no one else to protect it from.
const PROTECTED_PAGE_PREFIX = "/admin";
const PROTECTED_API_PREFIXES = ["/api/segments", "/api/sync", "/api/local-videos", "/api/videos"];

export function middleware(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin-login";
  if (isLoginPage || isLoginApi) return NextResponse.next();

  // The search page reads GET /api/segments to list everything — that's the
  // one API every visitor needs, so it stays public. Only mutating it (POST)
  // requires the admin cookie.
  const isPublicSegmentsRead = pathname === "/api/segments" && req.method === "GET";
  if (isPublicSegmentsRead) return NextResponse.next();

  const isProtectedPage = pathname.startsWith(PROTECTED_PAGE_PREFIX);
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  const authed = req.cookies.get("admin_session")?.value === adminPassword;
  if (authed) return NextResponse.next();

  if (isProtectedApi) {
    return NextResponse.json({ error: "관리자 인증이 필요합니다" }, { status: 401 });
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/segments/:path*", "/api/sync/:path*", "/api/local-videos/:path*", "/api/videos/:path*"],
};
