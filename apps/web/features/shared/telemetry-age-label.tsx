"use client";

import * as React from "react";
import { telemetryAge } from "../../lib/telemetry-age";

export function TelemetryAgeLabel({ value, locale, compact = false }: {
  value: unknown;
  locale: string;
  compact?: boolean;
}) {
  // Server HTML and the first client render must not depend on their clocks.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const age = telemetryAge(value, locale, now);
  const timestamp=typeof value==='string'?Date.parse(value):value instanceof Date?value.getTime():NaN;
  const hasReceipt=Number.isFinite(timestamp)&&timestamp<=now;
  if (compact) {
    return <span className={age.fresh ? "text-success" : "text-muted-foreground"}>{age.text}</span>;
  }
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className={`size-2 rounded-full shrink-0 ${age.fresh ? "bg-success motion-safe:animate-pulse" : hasReceipt ? "bg-warning" : "bg-muted-foreground"}`} />
      <span className={age.fresh ? "text-foreground font-medium" : "text-muted-foreground"}>{age.text}</span>
    </div>
  );
}
