import { NextResponse } from "next/server";

import { buildDependencyHealth, loadEnv } from "@solar/domain";

export const runtime = "nodejs";

export async function GET() {
  const env = loadEnv(process.env);

  return NextResponse.json({
    ...buildDependencyHealth("web", env),
    checkedAt: new Date().toISOString()
  });
}

