import { cookies } from "next/headers";

/**
 * Authenticated server-side fetch for Next.js Server Components.
 *
 * Reads `access_token` from the request cookie jar (set by authStore.setAuth
 * on the client after login) and attaches it as `Authorization: Bearer <token>`
 * on every outgoing request to the API.
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

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}

/**
 * Returns the correct API base URL for server-side fetches.
 * - API_INTERNAL_URL: used in production/Docker for internal network routing
 *   (e.g., http://api:3001 in Docker Compose) — never exposed to the browser
 * - NEXT_PUBLIC_API_URL: public URL, also works from server side in dev
 * - fallback: http://localhost:3001 for local development
 */
export function getApiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}
