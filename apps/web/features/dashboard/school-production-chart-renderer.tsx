"use client";
import type { DashboardSummaryDataPoint } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "../../components/ui/chart";
import { formatAppDate } from "../../lib/date-format";

export function SchoolProductionChart({
  points,
  locale,
}: {
  points: DashboardSummaryDataPoint[];
  locale: Locale;
}) {
  const measured = points.map((point) => ({
    ...point,
    value: Number.isFinite(point.value) ? point.value : null,
  }));
  if (!measured.some((point) => point.value !== null))
    return (
      <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
        {locale === "th"
          ? "ยังไม่มีข้อมูลในช่วงเวลาที่เลือก"
          : "No data in this date range"}
      </p>
    );
  return (
    <ChartContainer
      config={{ value: { label: "kWh", color: "var(--primary)" } }}
      className="h-56"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={measured}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatAppDate(String(value), locale)}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            minTickGap={32}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={45}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={(value) => formatAppDate(String(value), locale)}
            formatter={(value) => [
              `${Number(value).toLocaleString(locale, { maximumFractionDigits: 2 })} kWh`,
              locale === "th" ? "พลังงานที่ผลิต" : "Generated energy",
            ]}
            contentStyle={{
              background: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: 12,
              color: "var(--foreground)",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.12}
            strokeWidth={2.5}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
