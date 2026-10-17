"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";

export interface ConfirmDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
  busy?: boolean;
  inline?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  variant = "default",
  busy = false,
  inline = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isControlled = open !== undefined;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    await onConfirm();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && onCancel) {
      onCancel();
    }
    onOpenChange?.(nextOpen);
  };

  if (inline) {
    return (
      <div role="alertdialog" className="sm:max-w-md space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    );
  }

  const dialogProps = isControlled
    ? { open, onOpenChange: handleOpenChange }
    : { onOpenChange: handleOpenChange };

  return (
    <AlertDialog {...dialogProps}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="flex justify-end gap-2 pt-2">
          <AlertDialogCancel onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Backward-compatible alias
export function ConfirmAction(props: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      trigger={props.trigger}
      title={props.title}
      description={props.description}
      {...(props.confirmLabel !== undefined ? { confirmLabel: props.confirmLabel } : {})}
      onConfirm={props.onConfirm}
    />
  );
}
