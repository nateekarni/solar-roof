"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Search,
} from "lucide-react";
import * as React from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useLocale, useT } from "../../providers/locale-provider";

export interface OperationCardListProps {
  resource: string;
  title: string;
  columns: string[];
  rows: Record<string, any>[];
  idKey?: string;
  pageSize?: number;
}

export function OperationCardList({
  resource,
  title,
  columns: rawColumns,
  rows,
  idKey = "id",
  pageSize = 10,
}: OperationCardListProps) {
  const t = useT();
  const locale = useLocale();

  const [searchTerm, setSearchTerm] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Format numbers / currency
  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: 2,
    }).format(num);
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
          className="bg-success/15 text-success border-success/30 font-medium text-[11px] px-2 py-0.5"
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
          className="bg-warning/15 text-warning border-warning/30 font-medium text-[11px] px-2 py-0.5"
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
        <Badge variant="destructive" className="font-medium text-[11px] px-2 py-0.5">
          {display}
        </Badge>
      );
    }
    return <Badge variant="secondary" className="text-[11px] px-2 py-0.5">{cell}</Badge>;
  };

  const isStatusValue = (val: any) => {
    const str = String(val ?? "").toLowerCase();
    return (
      str === "ออนไลน์" ||
      str === "ออฟไลน์" ||
      str === "ต้องตรวจสอบ" ||
      str === "critical" ||
      str === "warning" ||
      str === "active" ||
      str === "paid" ||
      str === "pending" ||
      str === "draft" ||
      str === "สำเร็จ" ||
      str === "แจ้งเตือน" ||
      str === "ใช้งานอยู่"
    );
  };

  // Filter rows based on search term
  const filteredRows = React.useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((row) => {
      return Object.entries(row).some(([key, val]) => {
        if (key === idKey) return false;
        return String(val ?? "").toLowerCase().includes(term);
      });
    });
  }, [rows, searchTerm, idKey]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Column keys
  const keys = React.useMemo(() => {
    const first = rows[0];
    if (!first) return [];
    return Object.keys(first).filter((k) => k !== idKey);
  }, [rows, idKey]);

  // Find primary title key & status key
  const titleKey = keys[0] || "title";
  const statusKey = keys.find((k) => k.toLowerCase().includes("status") || k.toLowerCase().includes("severity"));

  const secondaryKeys = keys.filter((k) => k !== titleKey && k !== statusKey);

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={locale === "th" ? `ค้นหา ${title}...` : `Search ${title}...`}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="pl-9 h-10 text-xs bg-card border-border shadow-2xs rounded-lg"
        />
      </div>

      {/* Cards List */}
      {pagedRows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center bg-card border-border/80 rounded-xl">
          <div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground mb-2">
            <FileQuestion className="size-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {locale === "th" ? "ไม่พบข้อมูล" : "No data found"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {searchTerm
              ? (locale === "th" ? "ลองค้นหาด้วยคำค้นอื่น" : "Try searching with a different keyword")
              : (locale === "th" ? "ยังไม่มีรายการในขณะนี้" : "No records available at this time")}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {pagedRows.map((row, idx) => {
            const rawTitleVal = row[titleKey];
            const titleDisplay = String(rawTitleVal ?? "-");
            const statusVal = statusKey ? row[statusKey] : null;

            return (
              <Card
                key={row[idKey] ?? idx}
                className="p-3.5 bg-card border-border/80 shadow-2xs rounded-xl space-y-2.5 hover:border-primary/40 transition-colors"
              >
                {/* Card Header: Title + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                      {rawColumns[0] ?? titleKey}
                    </p>
                    <h3 className="text-sm font-bold text-foreground truncate mt-0.5">
                      {titleDisplay}
                    </h3>
                  </div>

                  {statusVal !== null && statusVal !== undefined && (
                    <div className="shrink-0">
                      {getStatusBadge(String(statusVal))}
                    </div>
                  )}
                </div>

                {/* Card Body: Secondary Details */}
                {secondaryKeys.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                    {secondaryKeys.slice(0, 4).map((key, kIdx) => {
                      const colHeader = rawColumns[keys.indexOf(key)] ?? key;
                      const val = row[key];
                      const str = String(val ?? "-");

                      const isAmount =
                        key.toLowerCase().includes("amount") ||
                        key.toLowerCase().includes("ยอด") ||
                        key.toLowerCase().includes("price") ||
                        key.toLowerCase().includes("revenue");

                      const isEnergy =
                        key.toLowerCase().includes("kwh") ||
                        key.toLowerCase().includes("mwp") ||
                        key.toLowerCase().includes("power") ||
                        key.toLowerCase().includes("capacity");

                      return (
                        <div key={key} className="space-y-0.5 min-w-0">
                          <span className="text-[10px] text-muted-foreground font-medium block truncate">
                            {colHeader}
                          </span>
                          <span className={`block truncate ${
                            isAmount
                              ? "font-semibold text-primary"
                              : isEnergy
                              ? "font-semibold text-foreground"
                              : isStatusValue(val)
                              ? ""
                              : "text-foreground"
                          }`}>
                            {isStatusValue(val) ? (
                              getStatusBadge(str)
                            ) : isAmount ? (
                              `฿${formatNumber(val)}`
                            ) : isEnergy ? (
                              formatNumber(val)
                            ) : (
                              str
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Mobile Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 px-1 text-xs">
          <span className="text-muted-foreground font-medium">
            {locale === "th"
              ? `หน้า ${currentPage} จาก ${totalPages} (${filteredRows.length} รายการ)`
              : `Page ${currentPage} of ${totalPages} (${filteredRows.length} items)`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="size-8 rounded-lg"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="size-8 rounded-lg"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
