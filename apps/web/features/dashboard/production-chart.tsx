"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Spinner } from "../../components/ui/spinner";
import { ZapOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "../../lib/api-client";
import { useLocale } from "../../providers/locale-provider";
import {
  formatChartTooltipLabel,
  formatChartAxisLabel,
  formatAppDateRange,
} from "../../lib/date-format";

type Point = { date: string; value: number; quality?: string };
type ChartPoint = { label: string; value: number; unit?: string };

const mapInitialData = (data?: Point[]): ChartPoint[] => {
  if (!data || data.length === 0) return [];
  return data.map((p) => ({
    label: p.date.includes("T")
      ? p.date.slice(11, 16)
      : p.date.length >= 10
        ? p.date.slice(5)
        : p.date,
    value: p.value,
    unit: "MWh",
  }));
};

export function ProductionChart({
  initialData,
  hasCustomRange = false,
  startDate,
  endDate,
}: {
  initialData?: Point[] | undefined;
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

  const [period, setPeriod] = React.useState("day");
  const [chartData, setChartData] = React.useState<ChartPoint[]>(() =>
    mapInitialData(initialData)
  );
  const [unit, setUnit] = React.useState("MWh");
  const [loading, setLoading] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
    if (hasCustomRange) {
      setChartData(mapInitialData(initialData));
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
        const data = await apiClient.get<ChartPoint[]>(
          `/v1/dashboard/production?period=${period}`
        );
        if (active) {
          setChartData(data);
          if (data.length > 0 && data[0]?.unit) {
            setUnit(data[0].unit);
          } else {
            setUnit(period === "year" ? "GWh" : "MWh");
          }
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
  }, [period, hasCustomRange, initialData]);

  const axisInterval = React.useMemo(() => {
    if (period === "day" || (chartData.length >= 20 && chartData.length <= 25)) {
      return 3; // Skips 3 ticks -> shows every 4 hours: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
    }
    if (chartData.length >= 28) {
      return 2;
    }
    if (chartData.length >= 14) {
      return 1;
    }
    return 0;
  }, [period, chartData.length]);

  return (
    <Card className="panel flex flex-col flex-1 h-full">
      <CardHeader className="p-0 pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              {locale === "en" ? "Energy Production" : "พลังงานผลิต"}
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
                <TabsTrigger value="day" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Daily" : "รายวัน"}
                </TabsTrigger>
                <TabsTrigger value="week" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Weekly" : "รายสัปดาห์"}
                </TabsTrigger>
                <TabsTrigger value="month" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Monthly" : "รายเดือน"}
                </TabsTrigger>
                <TabsTrigger value="year" className="h-6 px-2.5 text-[11px]">
                  {locale === "en" ? "Yearly" : "รายปี"}
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
              <ZapOff className="size-6 text-muted-foreground/50" />
              <span>
                {locale === "en"
                  ? "No production data in this period"
                  : "ไม่มีข้อมูลการผลิตพลังงานในช่วงเวลานี้"}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 16, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="energy-gradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
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
                  stroke="var(--muted-foreground)"
                  minTickGap={28}
                  interval={axisInterval}
                  tickFormatter={(val) => formatChartAxisLabel(String(val), locale)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={10}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip
                  cursor={{
                    stroke: "var(--muted-foreground)",
                    strokeWidth: 1,
                    strokeDasharray: "3 3",
                  }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const item = payload[0];
                      const label =
                        (item.payload as { label?: string })?.label ?? "";
                      return (
                        <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-md">
                          <p className="font-medium text-[10px] text-muted-foreground">
                            {formatChartTooltipLabel(label, locale)}
                          </p>
                          <p className="font-bold text-xs text-foreground">
                            {item.value} {unit}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  fill="url(#energy-gradient)"
                  dot={{ r: 2.5, fill: "var(--primary)" }}
                  activeDot={{
                    r: 5,
                    fill: "var(--primary)",
                    stroke: "var(--card)",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
