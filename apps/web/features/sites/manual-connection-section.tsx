"use client";
import type { ReactNode } from "react";
import { ChevronDown, Radio } from "lucide-react";

export function ManualConnectionSection({ children, title = "กรอกหรือแก้ไขรายละเอียดการเชื่อมต่อเอง", defaultOpen = false }: { children: ReactNode; title?: string; defaultOpen?: boolean }) {
  return <details open={defaultOpen} className="group rounded-xl border bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-4 text-sm font-semibold transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <Radio aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="flex-1">{title}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-5 border-t p-4">{children}</div>
  </details>;
}
