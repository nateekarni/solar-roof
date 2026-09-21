"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAutoRefresh(intervalMs = 60_000) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(id);
  }, [router, intervalMs]);
}
