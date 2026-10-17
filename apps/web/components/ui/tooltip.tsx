"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  variant = "default",
  showArrow = true,
  inline = false,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  variant?: "default" | "popover" | "rich";
  showArrow?: boolean;
  inline?: boolean;
}) {
  const isPopover = variant === "popover" || variant === "rich";
  const content = (
    <TooltipPrimitive.Content
      data-slot="tooltip-content"
      data-variant={variant}
      sideOffset={isPopover && sideOffset === 0 ? 6 : sideOffset}
      className={cn(
        "z-50 inline-flex w-fit origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 text-xs has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        isPopover
          ? "flex-col items-stretch max-w-sm rounded-xl border border-border bg-popover text-popover-foreground shadow-lg px-3.5 py-3"
          : "max-w-xs rounded-md bg-foreground px-3 py-1.5 text-background shadow-md",
        className
      )}
      {...props}
    >
      {children}
      {showArrow && (
        <TooltipPrimitive.Arrow
          className={cn(
            "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]",
            isPopover
              ? "bg-popover fill-popover border-b border-r border-border shadow-xs"
              : "bg-foreground fill-foreground"
          )}
        />
      )}
    </TooltipPrimitive.Content>
  );

  if (inline) {
    return content;
  }

  return (
    <TooltipPrimitive.Portal>
      {content}
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
