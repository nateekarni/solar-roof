import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Liveness only. The API owns database, MQTT and storage readiness; the web
// container must not require those credentials merely to report that it runs.
export async function GET() {
  return NextResponse.json({service: "web", status: "healthy", checkedAt: new Date().toISOString()});
}
