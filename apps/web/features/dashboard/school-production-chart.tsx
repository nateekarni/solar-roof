"use client";
import dynamic from "next/dynamic";
import type { DashboardSummaryDataPoint } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";

// The interactive chart loads separately from the server-rendered summary and SVG.
const Chart = dynamic(
  () =>
    import("./school-production-chart-renderer").then(
      (module) => module.SchoolProductionChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-56 animate-pulse rounded-lg bg-muted"
        aria-busy="true"
      />
    ),
  },
);
export function SchoolProductionChart({
  points,
  locale,
}: {
  points: DashboardSummaryDataPoint[];
  locale: Locale;
}) {
  if (!points.some((point) => Number.isFinite(point.value)))
    return (
      <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        {locale === "th"
          ? "ยังไม่มีข้อมูลในช่วงเวลาที่เลือก"
          : "No data in this date range"}
      </p>
    );
  return <Chart points={points} locale={locale} />;
}
