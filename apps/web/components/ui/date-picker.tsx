"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { formatAppDate } from "../../lib/date-format";
import { useLocale } from "../../providers/locale-provider";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(val?: string | Date | null): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const [y, m, d] = trimmed.split(/[-T ]/).map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d);
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

export interface DatePickerProps {
  id?: string | undefined;
  value?: string | Date | undefined;
  onChange?: ((value: string) => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
}: DatePickerProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);

  const selectedDate = React.useMemo(() => parseISODate(value), [value]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange?.(toISODate(date));
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const defaultPlaceholder = locale === "th" ? "เลือกวันที่" : "Select date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full h-10 justify-start text-left font-normal text-xs rounded-md border border-input bg-transparent px-3 py-1 shadow-xs hover:bg-accent/50 dark:bg-input/30",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="size-3.5 mr-2 shrink-0 text-muted-foreground" />
          <span>
            {selectedDate
              ? formatAppDate(selectedDate, locale)
              : placeholder || defaultPlaceholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
