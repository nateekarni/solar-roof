"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../ui/alert-dialog";
import { Button } from "../ui/button";

export function ConfirmAction({ trigger, title, description, confirmLabel = "ยืนยัน", onConfirm }: { trigger: React.ReactNode; title: string; description: string; confirmLabel?: string; onConfirm: () => void }) {
  return <AlertDialog><AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction asChild><Button onClick={onConfirm}>{confirmLabel}</Button></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
