import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/activate") {
    const response=NextResponse.next();
    response.headers.set("Referrer-Policy","no-referrer");
    response.headers.set("Cache-Control","no-store");
    return response;
  }

  // Allow API routes, health check, and internal Next.js assets to pass through directly
  if (
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/health") ||
    pathname.startsWith("/_next/")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");

  const apiBase =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:3001";

  // 1. If user is trying to access protected routes without any tokens
  if (!accessToken && !refreshToken && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 2. If user is on protected route, access_token missing, but has refresh_token: attempt validation/refresh
  if (!accessToken && refreshToken && !isLoginPage) {
    try {
      const refreshRes = await fetch(`${apiBase}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (data?.accessToken) {
          const response = NextResponse.next();
          response.cookies.set("access_token", data.accessToken, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            maxAge: 900,
          });
          return response;
        }
      } else {
        // Refresh token revoked or invalid (e.g. after DB seed reset)
        const loginUrl = new URL("/login", request.url);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete("access_token");
        response.cookies.delete("refresh_token");
        return response;
      }
    } catch {
      // API unreachable or network error, let serverFetch handle redirect
    }
  }

  // 3. If authenticated user is trying to visit /login -> redirect to /
  if ((accessToken || refreshToken) && isLoginPage) {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|v1|health|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
