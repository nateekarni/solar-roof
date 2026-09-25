import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
 * If access_token is missing but refresh_token exists, attempts auto-refresh.
 * If response returns HTTP 401, immediately redirects to /login.
 *
 * Drop-in replacement for native fetch() in Server Components.
 * Do NOT use in Client Components — use apiClient instead.
 */
export async function serverFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const cookieStore = await cookies();
  let token = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;
  const baseUrl = getApiBaseUrl();

  // If access_token is missing but refresh_token is present, attempt server-side token refresh
  if (!token && refreshToken) {
    try {
      const refreshRes = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData?.accessToken) {
          token = refreshData.accessToken;
        }
      }
    } catch {
      // Ignore refresh error and fall through
    }
  }

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(url, { ...options, headers });

  // If we received 401 and we have a refreshToken, try refreshing once and retrying
  if (response.status === 401 && refreshToken) {
    try {
      const refreshRes = await fetch(`${baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData?.accessToken) {
          headers.set("Authorization", `Bearer ${refreshData.accessToken}`);
          response = await fetch(url, { ...options, headers });
        }
      }
    } catch {
      // Fall through
    }
  }

  // If still 401 (session revoked, expired, or db reset), redirect cleanly to /login
  if (response.status === 401) {
    redirect("/login");
  }

  return response;
}
