"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-1 select-none", className)}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col md:flex-row gap-6 justify-center",
          defaultClassNames.months
        ),
        month: cn("space-y-3", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between pointer-events-none z-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "pointer-events-auto size-8 p-0 rounded-lg border border-border/70 bg-card hover:bg-accent flex items-center justify-center text-foreground transition-colors shadow-2xs",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "pointer-events-auto size-8 p-0 rounded-lg border border-border/70 bg-card hover:bg-accent flex items-center justify-center text-foreground transition-colors shadow-2xs",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 items-center justify-center text-sm font-semibold text-foreground",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "text-sm font-semibold text-foreground select-none",
          defaultClassNames.caption_label
        ),
        dropdowns: cn(
          "flex h-8 w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "has-focus:border-ring border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] relative rounded-md border",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-popover absolute inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground w-9 h-9 font-medium text-xs text-center p-0 align-middle select-none",
          defaultClassNames.weekday
        ),
        weeks: cn("", defaultClassNames.weeks),
        week: cn("h-9", defaultClassNames.week),
        day: cn(
          "relative p-0 text-center text-sm h-9 w-9 align-middle",
          defaultClassNames.day
        ),
        day_button: cn("rdp-day_button", defaultClassNames.day_button),
        range_start: "rdp-range_start",
        range_middle: "rdp-range_middle",
        range_end: "rdp-range_end",
        today: "rdp-today",
        outside: "rdp-outside",
        disabled: "rdp-disabled",
        hidden: "rdp-hidden invisible",
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4 text-foreground", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4 text-foreground", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4 text-foreground", className)} {...props} />
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar, DayButton as CalendarDayButton }
