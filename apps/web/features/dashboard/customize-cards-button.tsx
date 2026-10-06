"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useLocale } from "../../providers/locale-provider";

export function CustomizeCardsButton() {
  const locale = useLocale();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("open-customize-cards"));
      }}
      className="h-10 gap-1.5 text-xs font-medium shadow-xs hover:bg-muted cursor-pointer"
    >
      <SlidersHorizontal className="size-3.5 text-primary" />
      <span>{locale === "th" ? "ปรับแต่งการ์ด" : "Customize"}</span>
    </Button>
  );
}
