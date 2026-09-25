"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSearchParams } from "next/navigation";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Spinner } from "../../components/ui/spinner";
import { DollarSign } from "lucide-react";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import {
  formatChartAxisLabel,
  formatChartTooltipLabel,
  formatAppDateRange,
} from "../../lib/date-format";

type RevenuePoint = { date: string; value: number };

type ChartPoint = {
  rawDate: string;
  label: string;
  monthLabel: string;
  yearLabel: string;
  value: number;
};

const THAI_SHORT_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

const ENGLISH_SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function parseRevenueChartPoint(
  rawDate: string,
  value: number,
  locale: "th" | "en" = "th"
): ChartPoint {
  const trimmed = String(rawDate || "").trim();

  // Multi-year: 4-digit Year (e.g. "2026")
  if (/^\d{4}$/.test(trimmed)) {
    const yr = Number(trimmed);
    const yrStr = locale === "th" ? String(yr + 543) : String(yr);
    return {
      rawDate: trimmed,
      label: trimmed,
      monthLabel: yrStr,
      yearLabel: "",
      value,
    };
  }

  // Monthly: YYYY-MM (e.g. "2026-04")
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [yrStr, moStr] = trimmed.split("-");
    const yr = Number(yrStr);
    const mIdx = Number(moStr) - 1;
    const moName =
      mIdx >= 0 && mIdx < 12
        ? locale === "th"
          ? THAI_SHORT_MONTHS[mIdx]!
          : ENGLISH_SHORT_MONTHS[mIdx]!
        : (moStr ?? "");
    const yrDisplay = locale === "th" ? String(yr + 543) : String(yr);
    return {
      rawDate: trimmed,
      label: trimmed,
      monthLabel: moName,
      yearLabel: yrDisplay,
      value,
    };
  }

  // Daily or Full Date: YYYY-MM-DD...
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parts = trimmed.split(/[-T ]/);
    const yr = Number(parts[0]);
    const mIdx = Number(parts[1]) - 1;
    const moName =
      mIdx >= 0 && mIdx < 12
        ? locale === "th"
          ? THAI_SHORT_MONTHS[mIdx]!
          : ENGLISH_SHORT_MONTHS[mIdx]!
        : (parts[1] ?? "");
    const yrDisplay = locale === "th" ? String(yr + 543) : String(yr);
    return {
      rawDate: trimmed,
      label: trimmed,
      monthLabel: moName,
      yearLabel: yrDisplay,
      value,
    };
  }

  // Fallback
  return {
    rawDate: trimmed,
    label: trimmed,
    monthLabel: formatChartAxisLabel(trimmed, locale),
    yearLabel: "",
    value,
  };
}

const formatCurrency = (val: number, locale: "th" | "en" = "th") => {
  if (locale === "th") {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(2)} ล้านบาท`;
    }
    return `${new Intl.NumberFormat("th-TH").format(val)} บาท`;
  }
  if (val >= 1000000) {
    return `฿ ${(val / 1000000).toFixed(2)}M`;
  }
  return `฿ ${new Intl.NumberFormat("en-US").format(val)}`;
};

const mapInitialRevenue = (
  data?: RevenuePoint[],
  locale: "th" | "en" = "th"
): ChartPoint[] => {
  if (!data || data.length === 0) return [];
  return data.map((p) => parseRevenueChartPoint(p.date, p.value, locale));
};

export function RevenueChart({
  initialData,
  hasCustomRange = false,
  startDate,
  endDate,
}: {
  initialData?: RevenuePoint[] | undefined;
  hasCustomRange?: boolean | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}) {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const effectiveStartDate = startDate || searchParams?.get("start_date") || "";
  const effectiveEndDate = endDate || searchParams?.get("end_date") || "";

  const badgeLabel = React.useMemo(() => {
    if (effectiveStartDate && effectiveEndDate) {
      return formatAppDateRange(effectiveStartDate, effectiveEndDate, locale, {
        includeYear: false,
      });
    }
    return locale === "en" ? "Selected Range" : "ช่วงเวลาที่เลือก";
  }, [effectiveStartDate, effectiveEndDate, locale]);

  const [period, setPeriod] = React.useState("year");
  const [chartData, setChartData] = React.useState<ChartPoint[]>(() =>
    mapInitialRevenue(initialData, locale)
  );
  const [loading, setLoading] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (hasCustomRange) {
      setChartData(mapInitialRevenue(initialData, locale));
      return;
    }

    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (initialData && initialData.length > 0) {
        return;
      }
    }

    let active = true;

    async function fetchData() {
      setLoading(true);
      try {
        const data = await apiClient.get<{ label: string; value: number }[]>(
          `/v1/dashboard/revenue?period=${period}`
        );
        if (active) {
          setChartData(data.map((p) => parseRevenueChartPoint(p.label, p.value, locale)));
        }
      } catch {
        if (active) {
          setChartData([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();

    return () => {
      active = false;
    };
  }, [period, hasCustomRange, initialData, locale]);

  const renderCustomTick = (tickProps: any) => {
    const { x, y, payload } = tickProps;
    const idx = payload?.index ?? tickProps.index;
    const item = chartData[idx];
    if (!item) return null;

    const isYearBoundary =
      idx > 0 &&
      item.yearLabel &&
      chartData[idx - 1]?.yearLabel &&
      item.yearLabel !== chartData[idx - 1]?.yearLabel;

    return (
      <g transform={`translate(${x},${y})`}>
        {/* Visual separator at boundary between different years */}
        {isYearBoundary && (
          <line
            x1={-14}
            y1={0}
            x2={-14}
            y2={30}
            stroke="var(--border)"
            strokeDasharray="2 2"
          />
        )}

        {/* Upper Row: Short Month Name (e.g. เม.ย., พ.ค., มิ.ย.) */}
        <text
          x={0}
          y={0}
          dy={10}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize={10}
          fontWeight={500}
        >
          {item.monthLabel}
        </text>

        {/* Lower Row: Year (e.g. 2569 or '69) on second line */}
        {item.yearLabel ? (
          <text
            x={0}
            y={0}
            dy={23}
            textAnchor="middle"
            fill="var(--foreground)"
            fontSize={9}
            fontWeight={500}
            opacity={0.8}
          >
            {item.yearLabel}
          </text>
        ) : null}
      </g>
    );
  };

  return (
    <Card className="panel flex flex-col flex-1 h-full">
      <CardHeader className="p-0 pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              {locale === "en" ? "Revenue" : "รายได้"}
            </CardTitle>
          </div>
          {hasCustomRange ? (
            <Badge
              variant="outline"
              className="h-6 px-2.5 text-[11px] font-normal text-muted-foreground border-border"
            >
              {badgeLabel}
            </Badge>
          ) : (
            <Tabs value={period} onValueChange={setPeriod} className="h-7">
              <TabsList className="h-7 bg-muted/70 p-0.5">
                <TabsTrigger value="year" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Yearly" : "รายปี"}
                </TabsTrigger>
                <TabsTrigger value="multi-year" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Multi-Year" : "หลายปี"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-[200px] w-full pt-1">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              <span>{locale === "en" ? "Loading data..." : "กำลังโหลดข้อมูล..."}</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <DollarSign className="size-6 text-muted-foreground/50" />
              <span>
                {locale === "en"
                  ? "No revenue data in this period"
                  : "ไม่มีข้อมูลรายได้ในช่วงเวลานี้"}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 10,
                  right: 14,
                  left: -20,
                  bottom: 8,
                }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={10}
                  height={38}
                  stroke="var(--muted-foreground)"
                  tick={renderCustomTick}
                  interval={0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(val) =>
                    val >= 1000000
                      ? `${(val / 1000000).toFixed(1)}M`
                      : `${Math.round(val / 1000)}k`
                  }
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const item = payload[0];
                      const p = item.payload as ChartPoint;
                      const displayLabel = p?.rawDate
                        ? formatChartTooltipLabel(p.rawDate, locale)
                        : p?.label ?? "";
                      return (
                        <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-md">
                          <p className="font-medium text-[10px] text-muted-foreground">
                            {displayLabel}
                          </p>
                          <p className="font-bold text-xs text-foreground">
                            {formatCurrency(Number(item.value ?? 0), locale)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  barSize={period === "multi-year" ? 28 : 12}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
