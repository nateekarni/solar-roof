"use client";

import * as React from "react";
import type { OperationFacets, OperationQuery } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { CalendarDays, Check, ChevronDown, Search } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { th, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { cn } from "@/lib/utils";
import {
  customerDocumentViews,
  customerDocumentView,
  customerDocumentStatusKeys,
} from "./customer-documents-model";

function parseDate(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
    : undefined;
}

function isoDate(value: Date | undefined) {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

function DateRangeFilter({
  query,
  locale,
  onChange,
}: {
  query: URLSearchParams;
  locale: Locale;
  onChange: (patch: Partial<OperationQuery>) => void;
}) {
  const t = createTranslator(locale);
  const current = React.useMemo<DateRange | undefined>(() => {
    const from = parseDate(query.get("from"));
    const to = parseDate(query.get("to"));
    return from || to ? { from, to } : undefined;
  }, [query]);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(current);
  const label = current?.from
    ? current.to
      ? `${displayDate(current.from, locale)} – ${displayDate(current.to, locale)}`
      : displayDate(current.from, locale)
    : t("customerPortal.billing.allPeriods");

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(current);
        setOpen(next);
      }}
      title={t("customerPortal.billing.period")}
      align="end"
      popoverClassName="w-auto rounded-2xl p-4"
      sheetClassName="max-h-[92vh] overflow-y-auto rounded-t-3xl p-4"
      trigger={
        <Button
          type="button"
          variant="outline"
          aria-label={t("customerPortal.billing.period")}
          className="h-11! w-full min-w-0 justify-between gap-2 bg-background px-3 md:w-auto md:min-w-48"
        >
          <CalendarDays className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      }
    >
      <div className="space-y-4">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          defaultMonth={draft?.from ?? new Date()}
          locale={locale === "th" ? th : enUS}
          numberOfMonths={1}
          className="mx-auto"
        />
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange({ from: "", to: "" });
              setOpen(false);
            }}
          >
            {t("customerPortal.billing.clearPeriod")}
          </Button>
          <Button
            type="button"
            disabled={!draft?.from}
            onClick={() => {
              onChange({
                from: isoDate(draft?.from),
                to: isoDate(draft?.to ?? draft?.from),
              });
              setOpen(false);
            }}
          >
            {t("customerPortal.billing.applyPeriod")}
          </Button>
        </div>
      </div>
    </ResponsivePopover>
  );
}

function StatusFilter({
  query,
  locale,
  facets,
  onChange,
}: {
  query: URLSearchParams;
  locale: Locale;
  facets?: OperationFacets | undefined;
  onChange: (patch: Partial<OperationQuery>) => void;
}) {
  const t = createTranslator(locale);
  const selected = customerDocumentView(query);
  const [open, setOpen] = React.useState(false);
  const label = t(
    `customerPortal.billing.${customerDocumentStatusKeys[selected]}`,
  );
  const count = facets?.billingStatusCounts?.[selected];
  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={t("customerPortal.billing.statusFilter")}
      align="end"
      popoverClassName="w-64 rounded-2xl p-2"
      sheetClassName="rounded-t-3xl p-4"
      trigger={
        <Button
          type="button"
          variant="outline"
          aria-label={t("customerPortal.billing.statusFilter")}
          aria-haspopup="listbox"
          className="h-11! w-full min-w-0 justify-between gap-2 bg-background px-3 md:w-auto md:min-w-48"
        >
          <span className="truncate">
            {label}
            {count !== undefined ? ` (${count})` : ""}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      }
    >
      <div role="listbox" aria-label={t("customerPortal.billing.statusFilter")}>
        {customerDocumentViews.map((view) => {
          const active = selected === view;
          const itemCount = facets?.billingStatusCounts?.[view];
          return (
            <Button
              type="button"
              role="option"
              aria-selected={active}
              key={view}
              variant="ghost"
              className={cn("min-h-11 w-full justify-start gap-3 rounded-xl px-3 text-left",active&&"bg-accent font-medium")}
              onClick={() => {
                onChange({ billingStatusView: view });
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", !active && "invisible")} />
              <span className="flex-1">
                {t(`customerPortal.billing.${customerDocumentStatusKeys[view]}`)}
              </span>
              {itemCount !== undefined && (
                <span className="tabular-nums text-muted-foreground">
                  {itemCount}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </ResponsivePopover>
  );
}

export function CustomerDocumentFilters({
  query,
  locale,
  facets,
  onChange,
}: {
  query: URLSearchParams;
  locale: Locale;
  facets?: OperationFacets | undefined;
  panelId: string;
  onChange: (patch: Partial<OperationQuery>) => void;
}) {
  const t = createTranslator(locale);
  return (
    <form
      className="flex min-w-0 flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        onChange({ search: String(values.get("search") ?? "") });
      }}
      key={query.toString()}
    >
      <span className="sr-only">{t("customerPortal.billing.search")}</span>
      <InputGroup className="h-11! bg-background md:max-w-sm">
        <InputGroupAddon>
          <Search className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          name="search"
          type="search"
          aria-label={t("customerPortal.billing.search")}
          defaultValue={query.get("search") ?? ""}
          placeholder={t("customerPortal.billing.searchPlaceholder")}
          className="h-11! text-base!"
        />
      </InputGroup>
      <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:shrink-0">
        <DateRangeFilter query={query} locale={locale} onChange={onChange} />
        <StatusFilter
          query={query}
          locale={locale}
          facets={facets}
          onChange={onChange}
        />
      </div>
    </form>
  );
}
