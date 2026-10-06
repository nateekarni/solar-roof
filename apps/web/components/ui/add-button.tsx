"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export function AddButton({ children, className, asChild, ...props }: React.ComponentProps<typeof Button>) {
  const icon = <Plus aria-hidden="true" data-icon="inline-start" className="size-4 shrink-0" />;
  const content = asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
    ? React.cloneElement(children, {}, <>{icon}{children.props.children}</>)
    : <>{icon}{children}</>;

  return <Button type="button" {...props} asChild={asChild ?? false} data-add-action="true" className={cn(className, "h-10 gap-2 px-4 text-sm")}>{content}</Button>;
}
