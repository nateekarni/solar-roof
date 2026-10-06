"use client";

import { Sun } from "lucide-react";
import { useT } from "../../providers/locale-provider";

interface AppLoadingProps {
  message?: string;
  fullPage?: boolean;
}

export function AppLoading({ message, fullPage = true }: AppLoadingProps) {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-full flex-col items-center justify-center gap-4 text-center ${fullPage ? "min-h-[calc(100svh-10.5rem)] md:min-h-[calc(100svh-5.5rem)]" : "min-h-40 py-6"}`}
    >
      <div aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-xs motion-safe:animate-pulse">
        <Sun className="size-8" />
      </div>
      <p className="text-sm text-muted-foreground">{message ?? t("common.loading")}</p>
    </div>
  );
}
