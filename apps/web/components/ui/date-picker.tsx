"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { th, enUS } from "date-fns/locale";
import { formatAppDate } from "../../lib/date-format";
import { useLocale } from "../../providers/locale-provider";
import { iconInputLayout } from "./icon-input-layout";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./select";

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
      const date = new Date(y, m - 1, d);
      return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : undefined;
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
  onValueChange?: ((value: string) => void) | undefined;
  "aria-label"?: string | undefined;
  required?: boolean | undefined;
  min?: string | undefined;
  max?: string | undefined;
  includeTime?: boolean | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function DatePicker({
  id,
  value,
  onChange,
  onValueChange,
  "aria-label": ariaLabel,
  required,
  min,
  max,
  includeTime = false,
  placeholder,
  disabled = false,
  className,
}: DatePickerProps) {
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const validationRef = React.useRef<HTMLInputElement>(null);
  const change = onValueChange ?? onChange;
  const time = typeof value === "string" ? value.split("T")[1]?.slice(0, 5) || "00:00" : "00:00";
  const minimum = parseISODate(min);
  const maximum = parseISODate(max);

  const selectedDate = React.useMemo(() => parseISODate(value), [value]);
  React.useEffect(() => {
    const outsideRange = selectedDate && ((minimum && selectedDate < minimum) || (maximum && selectedDate > maximum));
    validationRef.current?.setCustomValidity(outsideRange ? (locale === "th" ? "เลือกวันที่ในช่วงที่กำหนด" : "Select a date within the allowed range") : "");
  }, [value, min, max, locale]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      change?.(`${toISODate(date)}${includeTime ? `T${time}` : ""}`);
    } else {
      change?.("");
    }
    if (!includeTime) setOpen(false);
  };

  const defaultPlaceholder = locale === "th" ? "เลือกวันที่" : "Select date";

  return (
    <><input ref={validationRef} type="text" className="sr-only" tabIndex={-1} aria-hidden="true" required={required} disabled={disabled} value={selectedDate ? toISODate(selectedDate) : ""} onChange={()=>{}} onInvalid={event => {event.preventDefault();triggerRef.current?.focus();setOpen(true);}} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          ref={triggerRef}
          aria-label={ariaLabel}
          aria-required={required}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full h-10 justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className,
            iconInputLayout.trigger,
            "h-10 bg-white hover:bg-white aria-expanded:bg-white disabled:bg-muted dark:bg-white dark:hover:bg-white dark:aria-expanded:bg-white dark:disabled:bg-muted dark:text-neutral-950"
          )}
        >
          <CalendarIcon className={cn(iconInputLayout.icon, "text-muted-foreground")} />
          <span>
            {selectedDate
              ? `${formatAppDate(selectedDate, locale)}${includeTime ? ` ${time}` : ""}`
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
          locale={locale === "th" ? th : enUS}
          disabled={date => !!(minimum && date < minimum) || !!(maximum && date > maximum)}
        />
        {includeTime && <div className="flex items-center gap-2 px-2 py-3"><Select value={time.slice(0,2)} disabled={!selectedDate} onValueChange={hour=>selectedDate && change?.(`${toISODate(selectedDate)}T${hour}:${time.slice(3)}`)}><SelectTrigger aria-label={locale === "th" ? "ชั่วโมง" : "Hour"}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(hour=><SelectItem key={hour} value={hour}>{hour}</SelectItem>)}</SelectGroup></SelectContent></Select><span>:</span><Select value={time.slice(3)} disabled={!selectedDate} onValueChange={minute=>selectedDate && change?.(`${toISODate(selectedDate)}T${time.slice(0,2)}:${minute}`)}><SelectTrigger aria-label={locale === "th" ? "นาที" : "Minute"}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Array.from({length:60},(_,i)=>String(i).padStart(2,"0")).map(minute=><SelectItem key={minute} value={minute}>{minute}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
        <div className="flex justify-end gap-2 border-t pt-2"><Button type="button" variant="ghost" size="sm" onClick={()=>{change?.("");setOpen(false);}}>{locale === "th" ? "ล้างค่า" : "Clear"}</Button>{includeTime && <Button type="button" size="sm" onClick={()=>setOpen(false)}>{locale === "th" ? "เสร็จสิ้น" : "Done"}</Button>}</div>
      </PopoverContent>
    </Popover></>
  );
}
