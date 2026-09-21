"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import { DataTable } from "../../components/ui/data-table";
import { useLocale, useT } from "../../providers/locale-provider";
import { OperationCardList } from "./operation-card-list";

type SummaryItem = {
  label: string;
  value: string | number;
  unit: string;
  note: string;
};

export interface OperationTableProps {
  resource: string;
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  summary: SummaryItem[];
  idKey?: string | undefined;
}

export function OperationTable({
  resource,
  title,
  columns: rawColumns,
  rows,
  summary,
  idKey = "id",
}: OperationTableProps) {
  const t = useT();
  const locale = useLocale();

  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 2 }).format(num);
  };

  const getStatusBadge = (cell: string) => {
    const lower = String(cell).toLowerCase();
    if (
      cell === "ออนไลน์" ||
      lower === "active" ||
      lower === "online" ||
      cell === "พร้อมดาวน์โหลด" ||
      cell === "สำเร็จ" ||
      lower === "paid" ||
      cell === "ชำระแล้ว" ||
      cell === "ส่งสำเร็จ"
    ) {
      const display =
        lower === "paid" || cell === "ชำระแล้ว"
          ? locale === "th" ? "ชำระแล้ว" : "Paid"
          : lower === "online" || cell === "ออนไลน์"
          ? locale === "th" ? "ออนไลน์" : "Online"
          : lower === "active" || cell === "ใช้งานอยู่"
          ? locale === "th" ? "ใช้งานอยู่" : "Active"
          : cell;

      return (
        <Badge
          variant="secondary"
          className="bg-success/15 text-success border-success/30 font-medium"
        >
          {display}
        </Badge>
      );
    }
    if (
      cell === "แจ้งเตือน" ||
      lower === "warning" ||
      lower === "review" ||
      cell === "ต้องตรวจสอบ" ||
      cell === "ตรวจสอบ" ||
      lower === "pending" ||
      lower === "draft" ||
      cell === "รอดำเนินการ"
    ) {
      const display =
        lower === "pending"
          ? locale === "th" ? "รอชำระ" : "Pending"
          : lower === "draft"
          ? locale === "th" ? "ร่าง" : "Draft"
          : lower === "review" || cell === "ต้องตรวจสอบ"
          ? locale === "th" ? "ต้องตรวจสอบ" : "Review"
          : cell;

      return (
        <Badge
          variant="secondary"
          className="bg-warning/15 text-warning border-warning/30 font-medium"
        >
          {display}
        </Badge>
      );
    }
    if (
      cell === "ออฟไลน์" ||
      lower === "offline" ||
      lower === "danger" ||
      lower === "critical" ||
      cell === "วิกฤต" ||
      cell === "ระงับการใช้งาน"
    ) {
      const display =
        lower === "offline" || cell === "ออฟไลน์"
          ? locale === "th" ? "ออฟไลน์" : "Offline"
          : lower === "critical" || cell === "วิกฤต"
          ? locale === "th" ? "วิกฤต" : "Critical"
          : cell;

      return (
        <Badge variant="destructive" className="font-medium">
          {display}
        </Badge>
      );
    }
    return <Badge variant="secondary">{cell}</Badge>;
  };

  const tableColumns = React.useMemo<ColumnDef<Record<string, any>, any>[]>(() => {
    const firstRow = rows[0];
    if (!firstRow) return [];

    const keys = Object.keys(firstRow).filter((k) => k !== idKey);

    return keys.map((key, idx) => {
      const headerTitle = rawColumns[idx] ?? key;
      return {
        accessorKey: key,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 h-8 text-xs font-semibold hover:bg-transparent"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              {headerTitle}
              <ArrowUpDown className="ml-1.5 size-3 text-muted-foreground" />
            </Button>
          );
        },
        cell: ({ row }) => {
          const val = row.getValue(key);
          const str = String(val ?? "-");

          if (
            key.toLowerCase().includes("status") ||
            key.toLowerCase().includes("severity") ||
            str === "ออนไลน์" ||
            str === "ออฟไลน์" ||
            str === "ต้องตรวจสอบ" ||
            str === "critical" ||
            str === "warning" ||
            str === "active" ||
            str === "paid" ||
            str === "pending"
          ) {
            return getStatusBadge(str);
          }

          if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("ยอด")) {
            return (
              <span className="font-semibold text-foreground">
                ฿{formatNumber(val)}
              </span>
            );
          }

          if (key.toLowerCase().includes("kwh") || key.toLowerCase().includes("mwp")) {
            return (
              <span className="font-medium text-foreground">
                {formatNumber(val)}
              </span>
            );
          }

          return <span className="text-xs text-foreground">{str}</span>;
        },
      };
    });
  }, [rows, rawColumns, idKey, locale]);

  const searchPlaceholder =
    locale === "th"
      ? `ค้นหา ${title}...`
      : `Search ${title}...`;

  return (
    <>
      {/* Top Summary Stat Cards */}
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((stat, i) => (
            <Card className="stat-card" key={i}>
              <div className="stat-header">
                <span className="stat-label text-xs font-medium text-muted-foreground">
                  {stat.label}
                </span>
              </div>
              <div className="stat-value">
                <strong>
                  {formatNumber(stat.value)}{" "}
                  {stat.unit && <em>{stat.unit}</em>}
                </strong>
                {stat.note && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium h-4.5 px-1.5 rounded-full shrink-0 leading-none"
                  >
                    {stat.note}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Mobile Card View (< 768px) */}
      <div className="block md:hidden">
        <OperationCardList
          resource={resource}
          title={title}
          columns={rawColumns}
          rows={rows}
          idKey={idKey}
          pageSize={10}
        />
      </div>

      {/* Desktop Shadcn DataTable (>= 768px) */}
      <div className="hidden md:block">
        <DataTable
          columns={tableColumns}
          data={rows}
          searchPlaceholder={searchPlaceholder}
          pageSize={10}
        />
      </div>
    </>
  );
}
