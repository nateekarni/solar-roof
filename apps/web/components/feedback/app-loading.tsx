"use client";

import {BrandMark} from "../brand/brand-mark";
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
      <div aria-hidden="true" className="grid size-14 place-items-center motion-safe:animate-pulse">
        <BrandMark className="size-14"/>
      </div>
      <p className="text-sm text-muted-foreground">{message ?? t("common.loading")}</p>
    </div>
  );
}
