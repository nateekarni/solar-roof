"use client";

import { useAutoRefresh } from "../../hooks/use-auto-refresh";

export function DashboardAutoRefresh() {
  useAutoRefresh(60_000);
  return null;
}
