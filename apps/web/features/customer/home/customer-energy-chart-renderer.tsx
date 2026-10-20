"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CustomerPortalHomeResponse } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { formatDate } from "./customer-home-format";
import { useChartTooltipTrigger } from "../../dashboard/use-chart-tooltip-trigger";

export function CustomerEnergyChartRenderer({
  series,
  locale,
}: {
  series: CustomerPortalHomeResponse["energySeries"];
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const { trigger, handlers } = useChartTooltipTrigger();
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAnimate(!preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <div
      className="h-64 w-full min-w-0 overflow-hidden sm:h-72"
      role="group"
      aria-label={t("customerPortal.home.energy")}
      {...handlers}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={series}
          margin={{ top: 16, right: 12, bottom: 8, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--customer-border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tick={{ fill: "var(--customer-muted-foreground)", fontSize: 12 }}
            tickFormatter={(value) =>
              new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "short",
                timeZone: "Asia/Bangkok",
              }).format(new Date(value))
            }
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--customer-muted-foreground)", fontSize: 12 }}
            tickFormatter={(value) => number.format(value)}
          />
          <Tooltip
            trigger={trigger}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground shadow-sm">
                  <p className="font-medium">
                    {formatDate(String(label), locale)}
                  </p>
                  <p className="mt-1">
                    {payload[0]?.value == null
                      ? t("customerPortal.common.unavailable")
                      : `${number.format(Number(payload[0]?.value))} ${t("customerPortal.common.kwh")}`}
                  </p>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={t("customerPortal.common.kwh")}
            connectNulls={false}
            stroke="var(--customer-chart-primary)"
            fill="var(--customer-chart-primary)"
            fillOpacity={0.1}
            strokeWidth={3}
            dot={false}
            activeDot={{
              r: 5,
              stroke: "var(--customer-surface-elevated)",
              strokeWidth: 2,
            }}
            isAnimationActive={animate}
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
