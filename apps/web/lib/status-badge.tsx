import * as React from "react";
import { Badge } from "../components/ui/badge";

export const STATUS_MAP: Record<
  string,
  {
    th: string;
    en: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  // Warnings / Pending
  warning: {
    th: "เตือน",
    en: "Warning",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
  },
  review: {
    th: "ต้องตรวจสอบ",
    en: "Review",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
  },
  pending_review: {
    th: "รอตรวจสอบ",
    en: "Pending Review",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
  },
  pending_verification: {
    th: "รอตรวจสอบการชำระเงิน",
    en: "Pending Verification",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30 font-medium",
  },
  pending: {
    th: "รอชำระ",
    en: "Pending",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
  },
  open: {
    th: "รอดำเนินการ",
    en: "Open",
    variant: "secondary",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30",
  },
  draft: {
    th: "ฉบับร่าง",
    en: "Draft",
    variant: "secondary",
    className: "bg-muted text-muted-foreground border-border",
  },

  // Success / Approved / Resolved / Paid / Online
  approved: {
    th: "อนุมัติแล้ว",
    en: "Approved",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium",
  },
  resolved: {
    th: "แก้ไขแล้ว",
    en: "Resolved",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium",
  },
  paid: {
    th: "ชำระแล้ว",
    en: "Paid",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium",
  },
  online: {
    th: "ออนไลน์",
    en: "Online",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium",
  },
  active: {
    th: "ใช้งานอยู่",
    en: "Active",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium",
  },

  // Info / Acknowledged
  info: {
    th: "ข้อมูล",
    en: "Info",
    variant: "secondary",
    className: "bg-blue-500/15 text-blue-800 dark:text-blue-400 border-blue-500/30",
  },
  acknowledged: {
    th: "รับทราบแล้ว",
    en: "Acknowledged",
    variant: "secondary",
    className: "bg-sky-500/15 text-sky-800 dark:text-sky-400 border-sky-500/30",
  },

  // Destructive / Critical / Offline / Rejected / Overdue
  critical: {
    th: "วิกฤต",
    en: "Critical",
    variant: "destructive",
    className: "font-medium",
  },
  danger: {
    th: "อันตราย",
    en: "Danger",
    variant: "destructive",
    className: "font-medium",
  },
  offline: {
    th: "ออฟไลน์",
    en: "Offline",
    variant: "destructive",
    className: "font-medium",
  },
  rejected: {
    th: "ปฏิเสธ",
    en: "Rejected",
    variant: "destructive",
    className: "font-medium",
  },
  overdue: {
    th: "เกินกำหนดชำระ",
    en: "Overdue",
    variant: "destructive",
    className: "font-medium",
  },

  // Thai mappings
  "เตือน": { th: "เตือน", en: "Warning", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "แจ้งเตือน": { th: "เตือน", en: "Warning", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "ข้อมูล": { th: "ข้อมูล", en: "Info", variant: "secondary", className: "bg-blue-500/15 text-blue-800 dark:text-blue-400 border-blue-500/30" },
  "วิกฤต": { th: "วิกฤต", en: "Critical", variant: "destructive", className: "font-medium" },
  "รอดำเนินการ": { th: "รอดำเนินการ", en: "Open", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "รับทราบแล้ว": { th: "รับทราบแล้ว", en: "Acknowledged", variant: "secondary", className: "bg-sky-500/15 text-sky-800 dark:text-sky-400 border-sky-500/30" },
  "แก้ไขแล้ว": { th: "แก้ไขแล้ว", en: "Resolved", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "รอตรวจสอบ": { th: "รอตรวจสอบ", en: "Pending Review", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "ต้องตรวจสอบ": { th: "ต้องตรวจสอบ", en: "Review", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "ตรวจสอบ": { th: "ต้องตรวจสอบ", en: "Review", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "อนุมัติแล้ว": { th: "อนุมัติแล้ว", en: "Approved", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "อนุมัติ": { th: "อนุมัติแล้ว", en: "Approved", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "ปฏิเสธ": { th: "ปฏิเสธ", en: "Rejected", variant: "destructive", className: "font-medium" },
  "ฉบับร่าง": { th: "ฉบับร่าง", en: "Draft", variant: "secondary", className: "bg-muted text-muted-foreground border-border" },
  "ร่าง": { th: "ฉบับร่าง", en: "Draft", variant: "secondary", className: "bg-muted text-muted-foreground border-border" },
  "ชำระแล้ว": { th: "ชำระแล้ว", en: "Paid", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "รอชำระ": { th: "รอชำระ", en: "Pending", variant: "secondary", className: "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30" },
  "เกินกำหนดชำระ": { th: "เกินกำหนดชำระ", en: "Overdue", variant: "destructive", className: "font-medium" },
  "ออนไลน์": { th: "ออนไลน์", en: "Online", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "ออฟไลน์": { th: "ออฟไลน์", en: "Offline", variant: "destructive", className: "font-medium" },
  "ใช้งานอยู่": { th: "ใช้งานอยู่", en: "Active", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "ออกเอกสารแล้ว": { th: "ออกเอกสารแล้ว", en: "Issued", variant: "secondary", className: "bg-sky-500/15 text-sky-800 dark:text-sky-400 border-sky-500/30 font-medium" },
  "พร้อมดาวน์โหลด": { th: "พร้อมดาวน์โหลด", en: "Ready", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "สำเร็จ": { th: "สำเร็จ", en: "Completed", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
  "ส่งสำเร็จ": { th: "ส่งสำเร็จ", en: "Delivered", variant: "secondary", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30 font-medium" },
};

export function renderStatusBadge(cell: string, locale: "th" | "en" = "th") {
  const trimmed = String(cell ?? "").trim();
  const lower = trimmed.toLowerCase();

  const match = STATUS_MAP[lower] || STATUS_MAP[trimmed];
  if (match) {
    const text = locale === "th" ? match.th : match.en;
    return (
      <Badge variant={match.variant} className={match.className}>
        {text}
      </Badge>
    );
  }

  return <Badge variant="secondary">{trimmed || "-"}</Badge>;
}
