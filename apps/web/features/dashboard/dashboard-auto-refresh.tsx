"use client";

import { useAutoRefresh } from "../../hooks/use-auto-refresh";
import {useSiteSelection} from './site-selection-provider';

export function DashboardAutoRefresh() {
  const {pending}=useSiteSelection();
  useAutoRefresh(10_000,!pending);
  return null;
}
