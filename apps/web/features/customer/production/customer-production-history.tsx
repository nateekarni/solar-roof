"use client";

import * as React from "react";
import type { CustomerProductionHistory as ProductionHistory } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { ChartContainer } from "../../../components/ui/chart";
import { DatePicker } from "../../../components/ui/date-picker";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../../../components/ui/dialog";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { apiClient } from "../../../lib/api-client";

const statusLabel = (status: ProductionHistory["status"], th: boolean) =>
  status === "actual"
    ? th ? "ข้อมูลจริง" : "Actual"
    : status === "partial"
      ? th ? "ข้อมูลจริงบางส่วน" : "Partial actual data"
      : th ? "ไม่มีข้อมูล" : "Unavailable";

export function productionDateBounds(now = new Date()) {
  const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const local = new Date(`${today}T00:00:00.000Z`);
  return {
    max: today,
    min: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 5, 1)).toISOString().slice(0, 10),
  };
}

export function CustomerProductionHistory({
  initial,
  locale,
  customerName,
  afterHeader,
}: {
  initial: ProductionHistory | null;
  locale: Locale;
  customerName?: string | undefined;
  afterHeader?: React.ReactNode;
}) {
  const th = locale === "th";
  const bounds = React.useMemo(() => productionDateBounds(), []);
  const [data, setData] = React.useState(initial);
  const [selectedDate, setSelectedDate] = React.useState(initial?.date ?? bounds.max);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [animate, setAnimate] = React.useState(false);
  const energyNumber = React.useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );

  React.useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAnimate(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const load = async (date: string) => {
    setSelectedDate(date);
    setLoading(true);
    setError("");
    try {
      const next = await apiClient.get<ProductionHistory>(
        `/v1/customer/portal/production-history?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      setData(next);
      setSelectedDate(next.date);
    } catch {
      setSelectedDate(data?.date ?? bounds.max);
      setError(th ? "โหลดข้อมูลการผลิตสำหรับวันที่เลือกไม่สำเร็จ" : "Unable to load production for the selected date");
    } finally {
      setLoading(false);
    }
  };

  const current = data ? [...data.intervals].reverse().find((point) => point.valueKwh !== null) : undefined;
  const peak = data?.intervals.reduce<ProductionHistory["intervals"][number] | undefined>(
    (best, point) => point.valueKwh !== null && (best?.valueKwh == null || point.valueKwh > best.valueKwh) ? point : best,
    undefined,
  );
  const hour = (timestamp: string) =>
    new Intl.DateTimeFormat(th ? "th-TH" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: data?.timezone ?? "Asia/Bangkok",
    }).format(new Date(timestamp));
  const siteName = data?.site.name;
  const chartData = (data?.intervals ?? []).map((point) => ({
    ...point,
    hour: hour(point.timestamp).slice(0, 2),
    barValue: point.valueKwh,
    lineValue: point.valueKwh,
  }));
  const hasHourlyValues = chartData.some((point) => point.valueKwh !== null);

  return (
    <div className="contents">
      <header data-dashboard-area="header" className="customer-dashboard-heading flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">{th ? "แดชบอร์ด" : "Dashboard"}</h1>
          {(customerName || siteName) && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-sm">
              {[customerName, siteName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="shrink-0 sm:min-w-52">
          <DatePicker
            value={selectedDate}
            min={bounds.min}
            max={bounds.max}
            disabled={loading}
            onValueChange={(date) => date && void load(date)}
            aria-label={th ? "เลือกวันที่ผลิตไฟฟ้า" : "Select production date"}
            surface="muted"
            className="min-h-11 w-auto max-w-[45vw] rounded-md border border-primary/30 px-2 text-xs shadow-none sm:max-w-none sm:px-3 sm:text-sm"
          />
        </div>
      </header>

      <div className="contents">{afterHeader}</div>

      <section
        id="production"
        data-dashboard-area="production"
        aria-labelledby="production-title"
        aria-busy={loading}
        className="scroll-mt-24 min-w-0"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <h2 id="production-title" className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <ChartNoAxesColumnIncreasing aria-hidden="true" className="size-4 text-primary" />
              {th ? "ภาพรวมการผลิตไฟฟ้า" : "Production overview"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {th ? "เวลา Asia/Bangkok · แหล่งข้อมูลโทรมาตร" : "Asia/Bangkok · Telemetry source"}
            </p>
          </div>
          {data && (
            <Badge variant="outline" className="rounded-md border-primary/30 font-mono text-[10px] uppercase tracking-wide">
              {statusLabel(data.status, th)}
            </Badge>
          )}
        </div>

        {error && (
          <p role="alert" className="my-3 rounded-lg border border-destructive/25 bg-destructive/8 p-3 text-sm text-destructive">{error}</p>
        )}
        <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {loading && <p className="py-3">{th ? "กำลังโหลด…" : "Loading…"}</p>}
        </div>

        {data ? (
          <>
            <section
              data-production-kpis="open"
              className="divide-y divide-border/70 border-b border-border/70"
              aria-label={th ? "การผลิตของวันที่เลือก" : "Selected-day production"}
            >
              <article data-production-kpi="day-total" className="flex items-center justify-between gap-3 py-3">
                <p className="text-sm font-medium">{th ? "พลังงานที่บันทึกในวันที่เลือก" : "Recorded energy for selected day"}</p>
                <p className="shrink-0 font-mono text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                  {data.dayTotalKwh === null ? "—" : energyNumber.format(data.dayTotalKwh)}
                  {data.dayTotalKwh !== null && <span className="ml-1.5 text-xs font-normal text-muted-foreground sm:text-sm">kWh</span>}
                </p>
              </article>
              <article data-production-kpi="latest-interval" className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{th ? "ช่วงเวลาล่าสุด" : "Latest interval"}</p>
                  {current && <p className="text-[11px] text-muted-foreground">{hour(current.timestamp)}</p>}
                </div>
                <p className="shrink-0 font-mono text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                  {current?.valueKwh == null ? "—" : energyNumber.format(current.valueKwh)}
                  {current?.valueKwh != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground sm:text-sm">kWh</span>}
                </p>
              </article>
              <article data-production-kpi="peak-interval" className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{th ? "ชั่วโมงที่บันทึกสูงสุด" : "Highest recorded hour"}</p>
                  {peak && <p className="text-[11px] text-muted-foreground">{hour(peak.timestamp)}</p>}
                </div>
                <p className="shrink-0 font-mono text-xl font-semibold tracking-tight tabular-nums text-[var(--customer-link)] sm:text-2xl">
                  {peak?.valueKwh == null ? "—" : energyNumber.format(peak.valueKwh)}
                  {peak?.valueKwh != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground sm:text-sm">kWh</span>}
                </p>
              </article>
            </section>

            <div className="flex flex-wrap justify-between gap-2 py-3 text-[11px] text-muted-foreground">
              <span>{statusLabel(data.status, th)}</span>
              <span className="font-mono tabular-nums">
                {th ? "ข้อมูลล่าสุด" : "Source watermark"} · {data.watermark
                  ? new Intl.DateTimeFormat(th ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(new Date(data.watermark))
                  : "—"}
              </span>
            </div>

            <Card className="customer-dashboard-panel border border-primary/30 bg-card py-0">
              <CardContent className="p-3 sm:p-4">
                <h3 className="text-sm font-semibold sm:text-base">{th ? "แนวโน้มรายชั่วโมง" : "Hourly trend"}</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {th ? "พลังงานที่ผลิตได้ในแต่ละชั่วโมง · kWh" : "Energy generated each hour · kWh"}
                </p>
                {hasHourlyValues ? (
                  <div
                    data-customer-hourly-chart="composed"
                    className="customer-production-chart mt-3 h-52 min-w-0 sm:h-64"
                    role="img"
                    aria-label={th ? "กราฟการผลิตไฟฟ้ารายชั่วโมง" : "Hourly energy production chart"}
                  >
                    <ChartContainer
                      config={{
                        barValue: { label: th ? "พลังงาน" : "Energy", color: "var(--customer-chart-primary)" },
                        lineValue: { label: th ? "แนวโน้ม" : "Trend", color: "var(--customer-chart-primary)" },
                      }}
                      className="h-full w-full"
                    >
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -22 }} accessibilityLayer>
                          <CartesianGrid vertical={false} stroke="var(--customer-border)" strokeDasharray="2 5" />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} minTickGap={18} tick={{ fill: "var(--customer-muted-foreground)", fontSize: 10 }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--customer-muted-foreground)", fontSize: 10 }} />
                          <Tooltip
                            cursor={{ fill: "color-mix(in oklab, var(--customer-action-primary) 8%, transparent)" }}
                            content={({ active, payload, label }) => active && payload?.length ? (
                              <div className="rounded-lg border border-border bg-card p-2 text-xs shadow-lg">
                                <p className="font-mono text-muted-foreground">{label}:00</p>
                                <p className="mt-1 font-mono font-semibold text-foreground">
                                  {payload[0]?.payload?.valueKwh == null ? "—" : `${energyNumber.format(Number(payload[0].payload.valueKwh))} kWh`}
                                </p>
                              </div>
                            ) : null}
                          />
                          <Bar dataKey="barValue" fill="var(--customer-chart-primary)" fillOpacity={0.72} radius={[2, 2, 0, 0]} isAnimationActive={animate} animationDuration={400} />
                          <Line type="monotone" dataKey="lineValue" stroke="var(--customer-chart-primary)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={animate} animationDuration={400} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </div>
                ) : (
                  <p className="py-8 text-sm text-muted-foreground">{th ? "ไม่มีข้อมูลการผลิตสำหรับวันที่เลือก" : "No production data for the selected date."}</p>
                )}
              </CardContent>
            </Card>

            {data.intervals.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="mt-3 min-h-11 rounded-md text-xs">
                    {th ? "ดูค่าการผลิตรายชั่วโมง" : "View hourly readings"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="customer-portal sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>{th ? "ค่าการผลิตรายชั่วโมง" : "Hourly readings"}</DialogTitle>
                    <DialogDescription>{th ? "ค่าที่บันทึกได้จริงสำหรับวันที่เลือก" : "Recorded values for the selected day"}</DialogDescription>
                  </DialogHeader>
                  <DialogBody className="max-h-[60vh] overflow-auto">
                  <Table>
                    <TableCaption className="sr-only">{th ? "ค่าการผลิตไฟฟ้ารายชั่วโมง" : "Hourly energy production readings"}</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{th ? "เวลา" : "Time"}</TableHead>
                        <TableHead>{th ? "พลังงาน" : "Energy"}</TableHead>
                        <TableHead>{th ? "สถานะ" : "Status"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.intervals.map((point) => (
                        <TableRow key={point.timestamp}>
                          <TableCell><time dateTime={point.timestamp}>{hour(point.timestamp)}</time></TableCell>
                          <TableCell className="font-mono font-medium tabular-nums">{point.valueKwh === null ? "—" : `${energyNumber.format(point.valueKwh)} kWh`}</TableCell>
                          <TableCell className="text-muted-foreground">{statusLabel(point.status, th)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </DialogBody>
                </DialogContent>
              </Dialog>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              {th ? "ระบบจะแสดงเฉพาะข้อมูลที่ได้รับจริง และจะไม่ประมาณค่าที่ขาดหาย" : "Missing readings are never estimated."}
            </p>
          </>
        ) : (
          <div className="border-b border-dashed border-border py-6">
            <p className="font-semibold">{th ? "ข้อมูลการผลิตไม่พร้อมใช้งาน" : "Production data is unavailable"}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {th ? "ระบบจะแสดงเฉพาะข้อมูลโทรมาตรที่ได้รับจริง และจะไม่ประมาณค่าที่ขาดหาย" : "Only received telemetry is shown; missing readings are never estimated."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
