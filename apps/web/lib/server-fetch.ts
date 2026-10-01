import { cookies,headers as requestHeaders } from "next/headers";
import { redirect } from "next/navigation";
import {safeReturnTo} from './session-navigation';

/**
 * Returns the correct API base URL for server-side fetches.
 * - API_INTERNAL_URL: used in production/Docker for internal network routing
 *   (e.g., http://api:3001 in Docker Compose) — never exposed to the browser
 * - NEXT_PUBLIC_API_URL: public URL, also works from server side in dev
 * - fallback: http://localhost:3001 for local development
 */
export function getApiBaseUrl(): string {
  const internal = process.env.API_INTERNAL_URL?.trim();
  if (internal) return internal.replace(/\/$/, "");

  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub) return pub.replace(/\/$/, "");

  return "http://localhost:3001";
}

/**
 * Authenticated server-side fetch for Next.js Server Components.
 *
 * Reads `access_token` from the request cookie jar (set by authStore.setAuth
 * on the client after login) and attaches it as `Authorization: Bearer <token>`
 * on every outgoing request to the API.
 *
 * GET never rotates credentials. Missing/expired access with a refresh cookie
 * redirects to a browser page that sends the same-origin refresh POST.
 *
 * Drop-in replacement for native fetch() in Server Components.
 * Do NOT use in Client Components — use apiClient instead.
 */
export async function serverFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  // If still 401 (session revoked, expired, or db reset), redirect cleanly to /login
  if (response.status === 401) {
    if(refreshToken) {
      const returnTo=safeReturnTo((await requestHeaders()).get('x-solar-return-to'));
      redirect('/session/refresh?returnTo='+encodeURIComponent(returnTo));
    }
    redirect("/login");
  }

  return response;
}
