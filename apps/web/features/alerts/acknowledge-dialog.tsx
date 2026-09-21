"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

export function AcknowledgeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await apiClient.put<{ success: boolean; acknowledgedCount: number; message: string }>(
        "/v1/alerts/acknowledge-all"
      );
      notify.success(
        locale === "th"
          ? `รับทราบการแจ้งเตือนทั้งหมด ${res.acknowledgedCount} รายการเรียบร้อยแล้ว`
          : `Acknowledged ${res.acknowledgedCount} alerts successfully`
      );
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการรับทราบการแจ้งเตือน");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "รับทราบการแจ้งเตือนทั้งหมด" : "Acknowledge All Alerts"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "ยืนยันการเปลี่ยนสถานะการแจ้งเตือนที่เปิดอยู่ทั้งหมดเป็นรับทราบแล้ว"
                  : "Mark all active alarms and alerts as acknowledged"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 text-xs text-muted-foreground">
          {locale === "th"
            ? "การดำเนินการนี้จะอัปเดตสถานะของทุก Alert ในระบบ เพื่อให้ทีมงานทราบว่าได้รับการตรวจสอบแล้ว"
            : "This action will update all open alerts so that the operations team knows they have been reviewed."}
        </div>

        <DialogFooter className="pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-9"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
            className="text-xs h-9 font-semibold gap-1.5"
          >
            <CheckCircle className="size-3.5" />
            <span>{loading ? t("common.saving") : locale === "th" ? "ยืนยันรับทราบทั้งหมด" : "Confirm Acknowledge"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
