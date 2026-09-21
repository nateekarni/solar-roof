"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

type Collection = {
  total: number;
  paid: number;
  pending: number;
  unbilled?: number;
  paidPercent: number;
};

export function CollectionChart({ collection }: { collection?: Collection }) {
  const paid = collection?.paid ?? 0;
  const pending = collection?.pending ?? 0;
  const unbilled = collection?.unbilled ?? 0;
  const total = paid + pending + unbilled;
  const percent = total > 0 ? ((paid / total) * 100).toFixed(1) : "0.0";

  const data = total > 0
    ? [
        { name: "เก็บเงินแล้ว", value: paid, color: "var(--success)" },
        { name: "ค้างชำระ", value: pending, color: "var(--destructive)" },
        { name: "ยังไม่ออกบิล", value: unbilled, color: "var(--warning)" },
      ].filter((d) => d.value > 0)
    : [{ name: "ไม่มีข้อมูล", value: 1, color: "var(--muted)" }];

  const formatMillions = (val: number) => `${(val / 1000000).toFixed(2)} ลบ.`;

  return (
    <Card className="panel">
      <CardHeader className="p-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            การเก็บเงิน
          </CardTitle>
          <span className="text-[11px] text-muted-foreground">
            รอบบิลปัจจุบัน
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Donut Chart */}
          <div className="relative size-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={46}
                  outerRadius={62}
                  paddingAngle={total > 0 ? 2 : 0}
                  strokeWidth={0}
                >
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                {total > 0 && (
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0 && payload[0]) {
                        const item = payload[0];
                        return (
                          <div className="rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-md">
                            <p className="font-semibold text-xs">{item.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatMillions(Number(item.value ?? 0))}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <strong className="text-base font-bold text-foreground">
                {percent}%
              </strong>
              <span className="text-[9px] text-muted-foreground">
                เก็บเงินแล้ว
              </span>
            </div>
          </div>

          {/* Legend Items */}
          <div className="flex flex-col gap-2 text-xs flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <span className="size-2 rounded-full bg-success" />
                เก็บเงินแล้ว
              </span>
              <span className="font-semibold text-foreground text-xs">
                {formatMillions(paid)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <span className="size-2 rounded-full bg-destructive" />
                ค้างชำระ
              </span>
              <span className="font-semibold text-foreground text-xs">
                {formatMillions(pending)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                <span className="size-2 rounded-full bg-warning" />
                ยังไม่ออกบิล
              </span>
              <span className="font-semibold text-foreground text-xs">
                {formatMillions(unbilled)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 text-center border-t border-border pt-2.5">
          <Link
            href="/billing"
            className="text-xs font-semibold text-primary hover:underline"
          >
            ดูรายละเอียด
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
