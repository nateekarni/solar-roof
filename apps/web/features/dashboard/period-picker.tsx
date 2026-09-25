"use client";

import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "../../components/ui/button";
import { Calendar } from "../../components/ui/calendar";
import { ResponsivePopover } from "../../components/ui/responsive-popover";
import { useIsMobile } from "../../hooks/use-mobile";
import { useLocale } from "../../providers/locale-provider";
import { formatAppDateRange } from "../../lib/date-format";

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

type ViewMode = "day" | "month" | "year";

interface PresetItem {
  key: string;
  labelTh: string;
  labelEn: string;
  getRange: () => { from: Date; to: Date };
}

const DAY_PRESETS: PresetItem[] = [
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

const MONTH_PRESETS: PresetItem[] = [
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
  {
    key: "last_year",
    labelTh: "ปีที่แล้ว",
    labelEn: "Last Year",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31),
      };
    },
  },
];

const YEAR_PRESETS: PresetItem[] = [
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
  {
    key: "last_year",
    labelTh: "ปีที่แล้ว",
    labelEn: "Last Year",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31),
      };
    },
  },
  {
    key: "last_3_years",
    labelTh: "ย้อนหลัง 3 ปี",
    labelEn: "Last 3 Years",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear() - 2, 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
      };
    },
  },
  {
    key: "last_5_years",
    labelTh: "ย้อนหลัง 5 ปี",
    labelEn: "Last 5 Years",
    getRange: () => {
      const now = new Date();
      return {
        from: new Date(now.getFullYear() - 4, 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
      };
    },
  },
];

/**
 * Month Range Picker Component (12 Months in a Year)
 */
function MonthRangePicker({
  selected,
  onSelect,
  locale,
}: {
  selected?: DateRange | undefined;
  onSelect: (range: DateRange) => void;
  locale: "th" | "en";
}) {
  const currentYear = new Date().getFullYear();
  const [displayYear, setDisplayYear] = React.useState(
    selected?.from ? selected.from.getFullYear() : currentYear
  );

  const monthsTh = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.",
    "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.",
    "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const monthsEn = [
    "Jan", "Feb", "Mar", "Apr",
    "May", "Jun", "Jul", "Aug",
    "Sep", "Oct", "Nov", "Dec",
  ];
  const months = locale === "th" ? monthsTh : monthsEn;

  const handleMonthClick = (mIdx: number) => {
    const clickedStart = new Date(displayYear, mIdx, 1);
    const clickedEnd = new Date(displayYear, mIdx + 1, 0, 23, 59, 59);

    if (!selected?.from || (selected.from && selected.to && toISODate(selected.from) !== toISODate(selected.to))) {
      onSelect({ from: clickedStart, to: clickedEnd });
    } else {
      if (clickedStart < selected.from) {
        onSelect({
          from: clickedStart,
          to: new Date(selected.from.getFullYear(), selected.from.getMonth() + 1, 0, 23, 59, 59),
        });
      } else {
        onSelect({ from: selected.from, to: clickedEnd });
      }
    }
  };

  const isMonthSelected = (mIdx: number) => {
    if (!selected?.from) return { isStart: false, isEnd: false, isMiddle: false };
    const fromTime = new Date(selected.from.getFullYear(), selected.from.getMonth(), 1).getTime();
    const toTime = selected.to
      ? new Date(selected.to.getFullYear(), selected.to.getMonth(), 1).getTime()
      : fromTime;

    const thisTime = new Date(displayYear, mIdx, 1).getTime();

    const isStart = thisTime === fromTime;
    const isEnd = thisTime === toTime;
    const isMiddle = thisTime > fromTime && thisTime < toTime;

    return { isStart, isEnd, isMiddle };
  };

  const yearLabel = locale === "th" ? `${displayYear + 543}` : `${displayYear}`;

  return (
    <div className="w-full max-w-[380px] mx-auto space-y-3 py-2">
      {/* Year Navigation */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDisplayYear((y) => y - 1)}
          className="size-8 rounded-lg border-border/70 bg-card hover:bg-accent cursor-pointer"
        >
          <ChevronLeft className="size-4 text-foreground" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{yearLabel}</span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDisplayYear((y) => y + 1)}
          className="size-8 rounded-lg border-border/70 bg-card hover:bg-accent cursor-pointer"
        >
          <ChevronRight className="size-4 text-foreground" />
        </Button>
      </div>

      {/* 12 Months Grid */}
      <div className="grid grid-cols-4 gap-2">
        {months.map((mName, idx) => {
          const { isStart, isEnd, isMiddle } = isMonthSelected(idx);
          const isSelectedEndpoint = isStart || isEnd;

          let btnClass = "text-foreground hover:bg-accent hover:text-foreground";
          if (isSelectedEndpoint) {
            btnClass = "bg-[#EAB308] text-[#0F172A] font-bold shadow-xs hover:bg-[#EAB308]";
          } else if (isMiddle) {
            btnClass = "bg-[#FEF08A] dark:bg-[#EAB308]/25 text-[#0F172A] dark:text-[#FEF08A] font-semibold";
          }

          return (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              onClick={() => handleMonthClick(idx)}
              className={`h-10 text-xs rounded-lg transition-colors cursor-pointer ${btnClass}`}
            >
              {mName}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Year Range Picker Component (Single Column/Box Grid of Years)
 */
function YearRangePicker({
  selected,
  onSelect,
  locale,
}: {
  selected?: DateRange | undefined;
  onSelect: (range: DateRange) => void;
  locale: "th" | "en";
}) {
  const currentYear = new Date().getFullYear();
  const [baseYear, setBaseYear] = React.useState(
    selected?.from ? selected.from.getFullYear() : currentYear
  );

  // Generate 8 years around baseYear
  const years = Array.from({ length: 8 }, (_, i) => baseYear - 4 + i);

  const handleYearClick = (yr: number) => {
    const clickedStart = new Date(yr, 0, 1);
    const clickedEnd = new Date(yr, 11, 31, 23, 59, 59);

    if (!selected?.from || (selected.from && selected.to && toISODate(selected.from) !== toISODate(selected.to))) {
      onSelect({ from: clickedStart, to: clickedEnd });
    } else {
      if (clickedStart < selected.from) {
        onSelect({
          from: clickedStart,
          to: new Date(selected.from.getFullYear(), 11, 31, 23, 59, 59),
        });
      } else {
        onSelect({ from: selected.from, to: clickedEnd });
      }
    }
  };

  const isYearSelected = (yr: number) => {
    if (!selected?.from) return { isStart: false, isEnd: false, isMiddle: false };
    const fromYr = selected.from.getFullYear();
    const toYr = selected.to ? selected.to.getFullYear() : fromYr;

    const isStart = yr === fromYr;
    const isEnd = yr === toYr;
    const isMiddle = yr > fromYr && yr < toYr;

    return { isStart, isEnd, isMiddle };
  };

  return (
    <div className="w-full max-w-[320px] mx-auto space-y-3 py-2">
      {/* Year Window Navigation */}
      <div className="flex items-center justify-between px-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setBaseYear((y) => y - 8)}
          className="size-8 rounded-lg border-border/70 bg-card hover:bg-accent cursor-pointer"
        >
          <ChevronLeft className="size-4 text-foreground" />
        </Button>
        <span className="text-xs font-semibold text-muted-foreground">
          {locale === "th" ? "เลือกช่วงปี" : "Select Year Range"}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setBaseYear((y) => y + 8)}
          className="size-8 rounded-lg border-border/70 bg-card hover:bg-accent cursor-pointer"
        >
          <ChevronRight className="size-4 text-foreground" />
        </Button>
      </div>

      {/* Years 2x4 Grid */}
      <div className="grid grid-cols-2 gap-2">
        {years.map((yr) => {
          const { isStart, isEnd, isMiddle } = isYearSelected(yr);
          const isSelectedEndpoint = isStart || isEnd;
          const displayLabel = locale === "th" ? `${yr + 543}` : `${yr}`;

          let btnClass = "text-foreground hover:bg-accent hover:text-foreground";
          if (isSelectedEndpoint) {
            btnClass = "bg-[#EAB308] text-[#0F172A] font-bold shadow-xs hover:bg-[#EAB308]";
          } else if (isMiddle) {
            btnClass = "bg-[#FEF08A] dark:bg-[#EAB308]/25 text-[#0F172A] dark:text-[#FEF08A] font-semibold";
          }

          return (
            <Button
              key={yr}
              variant="ghost"
              size="sm"
              onClick={() => handleYearClick(yr)}
              className={`h-10 text-xs rounded-lg transition-colors cursor-pointer ${btnClass}`}
            >
              {displayLabel}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function PeriodPicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>("day");

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

  // Determine active presets for current mode
  const currentPresets = React.useMemo(() => {
    if (viewMode === "year") return YEAR_PRESETS;
    if (viewMode === "month") return MONTH_PRESETS;
    return DAY_PRESETS;
  }, [viewMode]);

  // Determine if initial range matches a preset
  const detectedPreset = React.useMemo(() => {
    const startStr = toISODate(initialRange.from);
    const endStr = toISODate(initialRange.to);
    for (const p of currentPresets) {
      const { from, to } = p.getRange();
      if (toISODate(from) === startStr && toISODate(to) === endStr) {
        return p.key;
      }
    }
    return "custom";
  }, [initialRange, currentPresets]);

  const [activePresetKey, setActivePresetKey] = React.useState<string>(detectedPreset);
  const [customRange, setCustomRange] = React.useState<DateRange | undefined>(initialRange);

  // Sync state when URL params change
  React.useEffect(() => {
    setActivePresetKey(detectedPreset);
    setCustomRange(initialRange);
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
    const { from, to } = preset.getRange();
    setCustomRange({ from, to });
    applyRange(from, to);
  };

  const handleApplyCustom = () => {
    if (customRange?.from && customRange?.to) {
      applyRange(customRange.from, customRange.to);
    }
  };

  // Compute trigger button label using Relative Date format
  const triggerLabel = React.useMemo(() => {
    if (customRange?.from && customRange?.to) {
      return formatAppDateRange(customRange.from, customRange.to, locale);
    }
    const preset = currentPresets.find((p) => p.key === activePresetKey);
    if (preset) {
      return locale === "th" ? preset.labelTh : preset.labelEn;
    }
    return locale === "th" ? "เลือกช่วงเวลา" : "Select Period";
  }, [activePresetKey, customRange, locale, currentPresets]);

  // Active range display in popover header & footer
  const activeRangeFormatted = React.useMemo(() => {
    const from = customRange?.from || initialRange.from;
    const to = customRange?.to || initialRange.to;
    return formatAppDateRange(from, to, locale);
  }, [customRange, initialRange, locale]);

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={locale === "th" ? "เลือกช่วงเวลาข้อมูล" : "Select Data Period"}
      popoverClassName="w-auto max-w-[620px] p-4 shadow-2xl rounded-2xl border border-border bg-card"
      sheetClassName="max-h-[92vh] p-4 flex flex-col gap-3 rounded-t-2xl overflow-y-auto"
      trigger={
        <Button
          variant="outline"
          className="h-9 sm:h-10 gap-1.5 sm:gap-2 rounded-lg border-border bg-white dark:bg-card px-2.5 sm:px-3 text-xs font-medium text-foreground shadow-xs hover:bg-neutral-50 dark:hover:bg-accent cursor-pointer shrink-0 truncate max-w-[190px] sm:max-w-none"
        >
          <CalendarIcon className="size-3.5 sm:size-4 text-muted-foreground mr-0.5 sm:mr-1 shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Header with Title and Formatted Relative Date */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            {locale === "th" ? "ช่วงเวลาข้อมูล" : "Date Period"}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {activeRangeFormatted}
          </span>
        </div>

        {/* View Mode Segmented Tabs (รายวัน / รายเดือน / รายปี) */}
        <div className="flex items-center p-1 bg-muted/60 rounded-xl gap-1 w-full max-w-[280px] mx-auto">
          <button
            type="button"
            onClick={() => setViewMode("day")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              viewMode === "day"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {locale === "th" ? "รายวัน" : "Daily"}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              viewMode === "month"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {locale === "th" ? "รายเดือน" : "Monthly"}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("year")}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              viewMode === "year"
                ? "bg-card text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {locale === "th" ? "รายปี" : "Yearly"}
          </button>
        </div>

        {/* Preset buttons (Divider removed) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
          {currentPresets.map((p) => {
            const isSelected = activePresetKey === p.key;
            return (
              <Button
                key={p.key}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => handlePresetSelect(p)}
                className={`h-8 text-xs justify-center font-medium px-2 transition-all ${
                  isSelected
                    ? "bg-[#EAB308] text-[#0F172A] font-semibold shadow-xs hover:bg-[#EAB308] hover:text-[#0F172A]"
                    : "text-muted-foreground hover:text-foreground border-border/80"
                }`}
              >
                {isSelected && <Check className="size-3 mr-1 shrink-0" />}
                <span className="truncate">{locale === "th" ? p.labelTh : p.labelEn}</span>
              </Button>
            );
          })}
        </div>

        {/* Picker Content Area: Border and padding removed */}
        <div className="pt-2">
          {viewMode === "day" && (
            <div className="flex justify-center overflow-x-auto">
              <Calendar
                mode="range"
                defaultMonth={customRange?.from || new Date()}
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range as DateRange | undefined);
                  setActivePresetKey("custom");
                }}
                numberOfMonths={isMobile ? 1 : 2}
                className="rounded-md"
              />
            </div>
          )}

          {viewMode === "month" && (
            <div className="flex justify-center">
              <MonthRangePicker
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  setActivePresetKey("custom");
                }}
                locale={locale}
              />
            </div>
          )}

          {viewMode === "year" && (
            <div className="flex justify-center">
              <YearRangePicker
                selected={customRange}
                onSelect={(range) => {
                  setCustomRange(range);
                  setActivePresetKey("custom");
                }}
                locale={locale}
              />
            </div>
          )}
        </div>

        {/* Action Footer: Divider removed */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2">
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            {customRange?.from ? (
              <span>
                <strong className="text-foreground">{formatAppDateRange(customRange.from, customRange.to || customRange.from, locale)}</strong>
                {!customRange.to && (
                  <span className="text-muted-foreground ml-1">
                    {locale === "th" ? "(เลือกวันสิ้นสุด)" : "(Select end date)"}
                  </span>
                )}
              </span>
            ) : (
              <span>{locale === "th" ? "คลิกเลือกช่วงเวลา" : "Select period"}</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="flex-1 sm:flex-none h-8 text-xs cursor-pointer"
            >
              {locale === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              size="sm"
              disabled={!customRange?.from || !customRange?.to}
              onClick={handleApplyCustom}
              className="flex-1 sm:flex-none h-8 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 cursor-pointer shadow-xs"
            >
              {locale === "th" ? "นำไปใช้" : "Apply"}
            </Button>
          </div>
        </div>
      </div>
    </ResponsivePopover>
  );
}
