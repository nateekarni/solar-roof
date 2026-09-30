"use client";

import { useAutoRefresh } from "../../hooks/use-auto-refresh";

export function OperationAutoRefresh({
  intervalMs = 10_000,
}: {
  intervalMs?: number;
}) {
  useAutoRefresh(intervalMs);
  return null;
}

