import { type NextRequest, NextResponse } from "next/server";
import {safeReturnTo} from './lib/session-navigation';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if(pathname==='/session/refresh')return NextResponse.next();

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

  // This is only a navigation hint; API verifies token/session/role on every read.
  let unexpiredAccess=false;
  try {unexpiredAccess=Number(JSON.parse(Buffer.from(accessToken?.split('.')[0] ?? '', 'base64url').toString()).exp)*1000>Date.now();}catch {}

  // 1. If user is trying to access protected routes without any tokens
  if (!accessToken && !refreshToken && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // GET never rotates credentials. A browser page performs a same-origin POST.
  if(!unexpiredAccess&&refreshToken&&!isLoginPage) {
    const bridge=request.nextUrl.clone();bridge.pathname='/session/refresh';bridge.search='';
    bridge.searchParams.set('returnTo',safeReturnTo(pathname+request.nextUrl.search));
    return NextResponse.redirect(bridge);
  }

  // 3. If authenticated user is trying to visit /login -> redirect to /
  if (unexpiredAccess && isLoginPage && request.nextUrl.searchParams.get('sessionExpired')!=='1') {
    const homeUrl = new URL("/", request.url);
    return NextResponse.redirect(homeUrl);
  }

  const headers=new Headers(request.headers);
  // Overwrite caller headers; Server Components may preserve the requested page.
  headers.set('x-solar-return-to',safeReturnTo(pathname+request.nextUrl.search));
  return NextResponse.next({request:{headers}});
}

export const config = {
  matcher: [
    "/((?!api|v1|health|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
