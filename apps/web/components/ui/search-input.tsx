"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "./input";
import { iconInputLayout } from "./icon-input-layout";
import { cn } from "../../lib/utils";

export function SearchInput({className, ...props}: React.ComponentProps<typeof Input>) {
  return <div className={cn("relative w-full max-w-xs", className)}><Search aria-hidden="true" className={cn("pointer-events-none text-muted-foreground", iconInputLayout.overlayIcon, iconInputLayout.icon)} /><Input {...props} type="search" className={cn("h-10", iconInputLayout.input)} /></div>;
}
