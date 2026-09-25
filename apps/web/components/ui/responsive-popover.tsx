"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface ResponsivePopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  popoverClassName?: string;
  sheetClassName?: string;
  sheetHeaderClassName?: string;
  showCloseButton?: boolean;
}

export function ResponsivePopover({
  trigger,
  children,
  title,
  open,
  onOpenChange,
  align = "end",
  sideOffset = 8,
  popoverClassName,
  sheetClassName,
  sheetHeaderClassName,
  showCloseButton = true,
}: ResponsivePopoverProps) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const controlProps: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  } = {};
  if (open !== undefined) controlProps.open = open;
  if (onOpenChange !== undefined) controlProps.onOpenChange = onOpenChange;

  if (mounted && isMobile) {
    return (
      <Sheet {...controlProps}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className={sheetClassName} showCloseButton={showCloseButton}>
          {title && (
            <SheetHeader className={sheetHeaderClassName}>
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
          )}
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover {...controlProps}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={sideOffset}
        className={popoverClassName}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
