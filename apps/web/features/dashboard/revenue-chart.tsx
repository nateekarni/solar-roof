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

type RevenuePoint = { date: string; value: number };
type ChartPoint = { label: string; value: number };

const formatCurrency = (val: number) => {
  if (val >= 1000000) {
    return `${(val / 1000000).toFixed(2)} ล้านบาท`;
  }
  return `${new Intl.NumberFormat("th-TH").format(val)} บาท`;
};

export function RevenueChart({ initialData }: { initialData?: RevenuePoint[] }) {
  const [period, setPeriod] = React.useState("month");
  const [chartData, setChartData] = React.useState<ChartPoint[]>(() => {
    if (!initialData || initialData.length === 0) return [];
    return initialData.map((p) => ({
      label: p.date.length > 5 ? p.date.slice(5) : p.date,
      value: p.value,
    }));
  });
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
          `/v1/dashboard/revenue?period=${period}`
        );
        if (active) {
          setChartData(data);
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
              รายได้ (Revenue)
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
              <DollarSign className="size-6 text-muted-foreground/50" />
              <span>ไม่มีข้อมูลรายได้ในช่วงเวลานี้</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
                  stroke="var(--muted-foreground)"
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
                            {formatCurrency(Number(item.value ?? 0))}
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
                  barSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
