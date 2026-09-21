"use client";

import { Calendar as CalendarIcon, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { ResponsivePopover } from "../../components/ui/responsive-popover";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLocale } from "../../providers/locale-provider";

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(str?: string | null): Date | undefined {
  if (!str) return undefined;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatThaiDate(d: Date, locale: "th" | "en" = "th"): string {
  if (locale === "th") {
    const thaiMonthsShort = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
    ];
    return `${d.getDate()} ${thaiMonthsShort[d.getMonth()]} ${d.getFullYear() + 543}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface PresetItem {
  key: string;
  labelTh: string;
  labelEn: string;
  getRange: () => { from: Date; to: Date };
}

const PRESETS: PresetItem[] = [
  {
    key: "this_month",
    labelTh: "เดือนนี้",
    labelEn: "This Month",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    },
  },
  {
    key: "last_month",
    labelTh: "เดือนที่แล้ว",
    labelEn: "Last Month",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      };
    },
  },
  {
    key: "last_3_months",
    labelTh: "3 เดือนล่าสุด",
    labelEn: "Last 3 Months",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    },
  },
  {
    key: "last_6_months",
    labelTh: "6 เดือนล่าสุด",
    labelEn: "Last 6 Months",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 5, 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    },
  },
  {
    key: "this_year",
    labelTh: "ปีนี้",
    labelEn: "This Year",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
      };
    },
  },
];

export function PeriodPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  // Read initial date from searchParams
  const startDateParam = searchParams.get("start_date");
  const endDateParam = searchParams.get("end_date");
  const legacyMonth = searchParams.get("month");
  const legacyYear = searchParams.get("year");

  // Determine active date range
  const initialRange = React.useMemo<{ from: Date; to: Date }>(() => {
    if (startDateParam && endDateParam) {
      const parsedStart = parseISODate(startDateParam);
      const parsedEnd = parseISODate(endDateParam);
      if (parsedStart && parsedEnd) {
        return { from: parsedStart, to: parsedEnd };
      }
    }
    if (legacyMonth && legacyYear) {
      const m = Number(legacyMonth);
      const y = Number(legacyYear);
      if (!Number.isNaN(m) && !Number.isNaN(y)) {
        return {
          from: new Date(y, m - 1, 1),
          to: new Date(y, m, 0),
        };
      }
    }
    // Default: this month
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }, [startDateParam, endDateParam, legacyMonth, legacyYear]);

  // Determine if initial range matches a preset
  const detectedPreset = React.useMemo(() => {
    const startStr = toISODate(initialRange.from);
    const endStr = toISODate(initialRange.to);
    for (const p of PRESETS) {
      const { from, to } = p.getRange();
      if (toISODate(from) === startStr && toISODate(to) === endStr) {
        return p.key;
      }
    }
    return "custom";
  }, [initialRange]);

  const [activePresetKey, setActivePresetKey] = React.useState<string>(detectedPreset);
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(initialRange);
  const [showCalendar, setShowCalendar] = React.useState(detectedPreset === "custom");

  // Sync state when URL params change
  React.useEffect(() => {
    setActivePresetKey(detectedPreset);
    setCustomRange(initialRange);
    setShowCalendar(detectedPreset === "custom");
  }, [detectedPreset, initialRange]);

  const applyRange = (from: Date, to: Date) => {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("start_date", toISODate(from));
    params.set("end_date", toISODate(to));
    params.delete("month");
    params.delete("year");
    router.push(`/?${params.toString()}`);
  };

  const handlePresetSelect = (preset: PresetItem) => {
    setActivePresetKey(preset.key);
    setShowCalendar(false);
    const { from, to } = preset.getRange();
    setCustomRange({ from, to });
    applyRange(from, to);
  };

  const handleCustomMode = () => {
    setActivePresetKey("custom");
    setShowCalendar(true);
  };

  const handleApplyCustom = () => {
    if (customRange?.from && customRange?.to) {
      applyRange(customRange.from, customRange.to);
    }
  };

  // Compute trigger button label
  const triggerLabel = React.useMemo(() => {
    const preset = PRESETS.find((p) => p.key === activePresetKey);
    if (preset) {
      return locale === "th" ? preset.labelTh : preset.labelEn;
    }
    if (customRange?.from && customRange?.to) {
      return `${formatThaiDate(customRange.from, locale)} — ${formatThaiDate(customRange.to, locale)}`;
    }
    return locale === "th" ? "เลือกช่วงเวลา" : "Select Period";
  }, [activePresetKey, customRange, locale]);

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={locale === "th" ? "เลือกช่วงเวลาข้อมูล" : "Select Data Period"}
      popoverClassName="w-auto p-4 shadow-xl rounded-xl border border-border"
      sheetClassName="max-h-[90vh] p-4 flex flex-col gap-3 rounded-t-2xl overflow-y-auto"
      trigger={
        <Button
          variant="outline"
          className="h-9 gap-2 rounded-lg border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent"
        >
          <span>{triggerLabel}</span>
          <CalendarIcon className="size-3.5 text-muted-foreground" />
        </Button>
      }
    >
      <div className="space-y-3.5">
        <div className="flex items-center justify-between pb-1 border-b border-border/60">
          <span className="text-xs font-semibold text-foreground">
            {locale === "th" ? "ช่วงเวลาข้อมูล" : "Date Period"}
          </span>
          {activePresetKey !== "custom" && (
            <span className="text-[11px] text-muted-foreground">
              {formatThaiDate(initialRange.from, locale)} — {formatThaiDate(initialRange.to, locale)}
            </span>
          )}
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {PRESETS.map((p) => {
            const isSelected = activePresetKey === p.key && !showCalendar;
            return (
              <Button
                key={p.key}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSelect(p)}
                className={`h-8 text-xs justify-start font-medium px-2.5 transition-all ${
                  isSelected ? "shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isSelected && <Check className="size-3 mr-1.5 shrink-0" />}
                <span className="truncate">{locale === "th" ? p.labelTh : p.labelEn}</span>
              </Button>
            );
          })}
          <Button
            variant={showCalendar ? "default" : "outline"}
            size="sm"
            onClick={handleCustomMode}
            className={`h-8 text-xs justify-start font-medium px-2.5 transition-all ${
              showCalendar ? "shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {showCalendar && <Check className="size-3 mr-1.5 shrink-0" />}
            <span className="truncate">{locale === "th" ? "กำหนดเอง" : "Custom"}</span>
          </Button>
        </div>

        {/* Custom Calendar view */}
        {showCalendar && (
          <div className="space-y-3 pt-2 border-t border-border/60 animate-in fade-in-50 duration-150">
            <div className="flex justify-center rounded-lg border border-border/60 bg-muted/20 p-2">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(range) => setCustomRange(range as DateRange | undefined)}
                numberOfMonths={isMobile ? 1 : 2}
                className="rounded-md"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-1">
              <div className="text-xs text-muted-foreground text-center sm:text-left">
                {customRange?.from ? (
                  <span>
                    <strong className="text-foreground">{formatThaiDate(customRange.from, locale)}</strong>
                    {" — "}
                    {customRange.to ? (
                      <strong className="text-foreground">{formatThaiDate(customRange.to, locale)}</strong>
                    ) : (
                      <span>{locale === "th" ? "(เลือกวันสิ้นสุด)" : "(Select end date)"}</span>
                    )}
                  </span>
                ) : (
                  <span>{locale === "th" ? "คลิกเลือกวันเริ่มต้นและวันสิ้นสุด" : "Select start and end dates"}</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCalendar(false)}
                  className="flex-1 sm:flex-none h-8 text-xs"
                >
                  {locale === "th" ? "ยกเลิก" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  disabled={!customRange?.from || !customRange?.to}
                  onClick={handleApplyCustom}
                  className="flex-1 sm:flex-none h-8 text-xs font-semibold"
                >
                  {locale === "th" ? "นำไปใช้" : "Apply"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ResponsivePopover>
  );
}
