"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAutoRefresh(intervalMs = 10_000, enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) router.refresh(); };
    const id = setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange',refresh); window.removeEventListener('online',refresh); };
  }, [router, intervalMs, enabled]);
}
