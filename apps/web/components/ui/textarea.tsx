import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-white px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:bg-muted dark:disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-white dark:text-neutral-950 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
        "bg-white disabled:bg-muted dark:bg-white dark:disabled:bg-muted dark:text-neutral-950"
      )}
      {...props}
    />
  )
}

export { Textarea }
