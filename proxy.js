import { NextResponse } from "next/server";
import { verifyToken, MEMBER_COOKIE, ADMIN_COOKIE } from "./lib/auth";

// 로그인이 필요한 화면/변경 API를 첫 단계에서 막아준다.
// (Next.js 16부터 middleware.js는 proxy.js로 이름이 바뀌었다. 동작은 동일하다.)

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/admin/:path*"],
};

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(MEMBER_COOKIE)?.value;
    const payload = token ? await verifyToken(token) : null;
    if (!payload || payload.role !== "member") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("expired", "1");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const isAdminAuthRoute =
    pathname === "/admin/login" || pathname === "/api/admin/auth/login";

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (isAdminAuthRoute) return NextResponse.next();
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const payload = token ? await verifyToken(token) : null;
    if (!payload || payload.role !== "admin") {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}
