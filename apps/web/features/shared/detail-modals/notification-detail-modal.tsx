"use client";

import * as React from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  Copy,
  Mail,
  MessageSquare,
  Send,
  Smartphone,
  UserCheck,
  Check,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { notify } from "../../../components/feedback/notifications";
import { useLocale } from "../../../providers/locale-provider";

export interface NotificationItemData {
  id?: string;
  title?: string;
  detail?: string;
  severity?: string;
  channel?: string;
  recipient?: string;
  sentAt?: string;
  status?: string;
  [key: string]: any;
}

export function NotificationDetailModal({
  open,
  onOpenChange,
  notification,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: NotificationItemData | null;
}) {
  const locale = useLocale();
  const [copied, setCopied] = React.useState(false);

  if (!notification) return null;

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      notify.error(locale === "th" ? "คัดลอกไม่สำเร็จ" : "Could not copy to clipboard"); return;
    }
    setCopied(true);
    notify.success(locale === "th" ? "คัดลอกข้อความแล้ว" : "Message copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const isDelivered =
    notification.status === "ส่งสำเร็จ" ||
    notification.status === "delivered" ||
    notification.status === "sent";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Bell className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-bold truncate">
                  {notification.title || "รายละเอียดการแจ้งเตือน"}
                </DialogTitle>
                <Badge
                  variant={isDelivered ? "default" : "secondary"}
                  className="text-xs shrink-0"
                >
                  {notification.status || "—"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
                <Clock className="size-3 shrink-0" />
                <span>{notification.sentAt || "-"}</span>
                <span>• ช่องทาง: {notification.channel || "—"}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm my-2">
          {/* Notification Message Content Box */}
          <div className="p-4 rounded-xl border border-border/70 bg-card/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-primary" />
                <span>{locale === "th" ? "เนื้อหาข้อความแจ้งเตือน" : "Notification Content"}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => copyToClipboard(notification.detail || notification.title || "")}
                title={locale === "th" ? "คัดลอกข้อความ" : "Copy Content"}
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </Button>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border/40 text-foreground text-xs leading-relaxed whitespace-pre-line select-text">
              {notification.detail || notification.title || (locale === "th" ? "ไม่มีรายละเอียดข้อความเพิ่มเติม" : "No content provided.")}
            </div>
          </div>

          {/* Delivery Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Send className="size-3.5 text-primary" />
                <span>{locale === "th" ? "ช่องทางการส่ง" : "Delivery Channel"}</span>
              </div>
              <div className="font-medium text-xs text-foreground flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" />
                <span>{notification.channel || "—"}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-primary" />
                <span>{locale === "th" ? "กลุ่มผู้รับ" : "Recipients"}</span>
              </div>
              <div className="font-medium text-xs text-foreground truncate">
                {notification.recipient || "—"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5 text-primary" />
                <span>{locale === "th" ? "เวลาที่ส่งออก" : "Sent Timestamp"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {notification.sentAt || "-"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span>{locale === "th" ? "สถานะการนำส่ง" : "Delivery Status"}</span>
              </div>
              <div className="font-medium text-xs text-foreground flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${isDelivered ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span>{notification.status || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


