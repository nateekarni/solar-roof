"use client";

import { useAutoRefresh } from "../../hooks/use-auto-refresh";

export function DashboardAutoRefresh() {
  useAutoRefresh(10_000);
  return null;
}
