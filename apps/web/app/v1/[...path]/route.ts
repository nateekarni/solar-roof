import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || "http://localhost:3001";

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetUrl = new URL(`/v1/${path.join("/")}`, API_INTERNAL_URL);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  // NextRequest exposes no verified transport peer. Never relay claimed identity.
  // The same-origin edge routes /v1 directly to API for verified per-client IP;
  // this fallback keeps the original Origin and shares the web transport budget.
  for(const name of [...headers.keys()]) {
    if(name==='forwarded'||name==='x-real-ip'||name.startsWith('x-forwarded-'))headers.delete(name);
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl.toString(), fetchOptions);

  const responseHeaders = new Headers(response.headers);
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
