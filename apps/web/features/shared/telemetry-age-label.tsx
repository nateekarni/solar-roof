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
  if (compact) {
    return <span className={age.fresh ? "text-emerald-600" : "text-muted-foreground"}>{age.text}</span>;
  }
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={`size-2 rounded-full shrink-0 ${age.fresh ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
      <span className={age.fresh ? "text-foreground font-medium" : "text-muted-foreground"}>{age.text}</span>
      {!age.fresh && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">(Offline)</span>}
    </div>
  );
}
