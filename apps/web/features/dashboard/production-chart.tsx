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
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Spinner } from "../../components/ui/spinner";
import { ZapOff } from "lucide-react";
import { apiClient } from "../../lib/api-client";

type Point = { date: string; value: number; quality?: string };
type ChartPoint = { label: string; value: number; unit?: string };

export function ProductionChart({ initialData }: { initialData?: Point[] }) {
  const [period, setPeriod] = React.useState("day");
  const [chartData, setChartData] = React.useState<ChartPoint[]>(() => {
    if (!initialData || initialData.length === 0) return [];
    return initialData.map((p) => ({
      label: p.date.includes("T")
        ? p.date.slice(11, 16)
        : p.date.length > 5
          ? p.date.slice(0, 5)
          : p.date,
      value: p.value,
      unit: "MWh",
    }));
  });
  const [unit, setUnit] = React.useState("MWh");
  const [loading, setLoading] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useEffect(() => {
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
  }, [period]);

  return (
    <Card className="panel">
      <CardHeader className="p-0 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              พลังงานผลิต (Energy Production)
            </CardTitle>
          </div>
          <Tabs value={period} onValueChange={setPeriod} className="h-7">
            <TabsList className="h-7 bg-muted/70 p-0.5">
              <TabsTrigger value="day" className="h-6 px-2.5 text-[11px]">
                รายวัน
              </TabsTrigger>
              <TabsTrigger value="week" className="h-6 px-2.5 text-[11px]">
                รายสัปดาห์
              </TabsTrigger>
              <TabsTrigger value="month" className="h-6 px-2.5 text-[11px]">
                รายเดือน
              </TabsTrigger>
              <TabsTrigger value="year" className="h-6 px-2.5 text-[11px]">
                รายปี
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative h-[210px] w-full pt-2">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              <span>กำลังโหลดข้อมูล...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <ZapOff className="size-6 text-muted-foreground/50" />
              <span>ไม่มีข้อมูลการผลิตพลังงานในช่วงเวลานี้</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0 && payload[0]) {
                      const item = payload[0];
                      const label =
                        (item.payload as { label?: string })?.label ?? "";
                      return (
                        <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-md">
                          <p className="font-medium text-[10px] text-muted-foreground">
                            {label}
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
