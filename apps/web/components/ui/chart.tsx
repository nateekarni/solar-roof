"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;
export function ChartContainer({ config: _config, className, children }: { config: ChartConfig; className?: string; children: React.ReactNode }) { return <div className={cn("w-full min-w-0", className)}>{children}</div>; }
type TooltipPayload = { value?: number | string };
export function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: React.ReactNode }) { if (!active || !payload?.length) return null; return <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl"><p className="font-medium">{label}</p><p className="text-muted-foreground">{new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(Number(payload[0]?.value ?? 0))} kWh</p></div>; }