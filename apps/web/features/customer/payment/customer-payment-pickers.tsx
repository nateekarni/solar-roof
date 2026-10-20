"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { th, enUS } from "date-fns/locale";
import { createTranslator, type Locale } from "@solar/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { ResponsivePopover } from "@/components/ui/responsive-popover";

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}
function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function CustomerPaymentDatePicker({
  value,
  max,
  locale,
  error,
  onChange,
}: {
  value: string;
  max: string;
  locale: Locale;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const t = createTranslator(locale);
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => parseDate(value), [value]);
  const maximum = React.useMemo(() => parseDate(max), [max]);
  const defaultMonth = selected ?? maximum;

  return (
    <Field data-invalid={Boolean(error)} className="min-w-0 gap-1.5">
      <FieldLabel htmlFor="customer-paidAt">
        {t("customerPortal.payment.paidAt")}
      </FieldLabel>
      <ResponsivePopover
        open={open}
        onOpenChange={setOpen}
        title={t("customerPortal.payment.paidAt")}
        align="start"
        popoverClassName="w-auto rounded-2xl p-3"
        sheetClassName="max-h-[92vh] overflow-y-auto rounded-t-3xl p-4"
        trigger={
          <Button
            id="customer-paidAt"
            type="button"
            variant="outline"
            aria-label={t("customerPortal.payment.paidAt")}
            aria-haspopup="dialog"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "customer-paidAt-error" : undefined}
            className="h-11! w-full min-w-0 justify-between rounded-xl! bg-background px-3 text-base font-normal"
          >
            <span className="min-w-0 truncate">
              {selected ? displayDate(selected, locale) : "—"}
            </span>
            <CalendarDays data-icon="inline-end" />
          </Button>
        }
      >
        <Calendar
          mode="single"
          selected={selected}
          {...(defaultMonth ? { defaultMonth } : {})}
          onSelect={(date) => {
            if (!date) return;
            onChange(isoDate(date));
            setOpen(false);
          }}
          disabled={(date) => Boolean(maximum && date > maximum)}
          locale={locale === "th" ? th : enUS}
          className="customer-payment-calendar mx-auto w-full md:w-auto"
          classNames={{
            root:
              "w-full [--rdp-day_button-height:40px] [--rdp-day_button-width:40px] md:w-fit",
            months:
              "relative flex w-full flex-col justify-center gap-6 md:w-auto md:flex-row",
            month: "w-full shrink-0 space-y-3 md:w-[280px]",
            month_grid: "w-full table-fixed border-collapse",
            weekday:
              "h-10 w-auto p-0 text-center align-middle text-xs font-medium text-muted-foreground select-none md:w-10",
            day: "relative h-10 w-auto p-0 text-center align-middle text-sm md:w-10",
          }}
          autoFocus
        />
      </ResponsivePopover>
      {error && (
        <FieldError id="customer-paidAt-error">{t(error)}</FieldError>
      )}
    </Field>
  );
}
