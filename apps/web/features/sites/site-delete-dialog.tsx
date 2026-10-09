"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { AlertTriangle, Archive, Trash2 } from "lucide-react";
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

export function SiteDeleteDialog({
  open,
  onOpenChange,
  site,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [loading, setLoading] = React.useState(false);
  const [hasLinkedError, setHasLinkedError] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setHasLinkedError(false);
      setErrorMessage("");
    }
  }, [open]);

  const handleDelete = async (mode?: "archive") => {
    if (!site) return;
    setLoading(true);
    try {
      const url = mode === "archive" ? `/v1/sites/${site.id}?mode=archive` : `/v1/sites/${site.id}`;
      const res = await apiClient.delete<{ success: boolean; message: string; archived?: boolean }>(url);
      notify.success(res.message || "ดำเนินการสำเร็จ");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      const msg = err.message || "ไม่สามารถลบไซต์งานได้";
      setErrorMessage(msg);
      // If error indicates linked contracts/billing cycles, offer archive
      if (msg.includes("สัญญา") || msg.includes("รอบบิล") || msg.includes("Archive")) {
        setHasLinkedError(true);
      } else {
        notify.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-destructive">
                {locale === "th" ? "ยืนยันการลบไซต์งาน" : "Delete Solar Site"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? `คุณต้องการลบไซต์งาน "${site?.name || ""}" หรือไม่?`
                  : `Are you sure you want to delete "${site?.name || ""}"?`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {hasLinkedError ? (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 space-y-2 text-warning-emphasis ">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning-emphasis" />
                <div className="space-y-1">
                  <p className="font-semibold">ไม่สามารถลบข้อมูลถาวรได้</p>
                  <p className="text-[11px] leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-warning/20">
                ท่านสามารถเลือกระงับการใช้งาน (Archive) เพื่อคงประวัติบิลและสัญญาไว้ในระบบ โดยปิดการรับส่งข้อมูลโทรมาตรของเกตเวย์
              </p>
            </div>
          ) : (
            <div className="text-muted-foreground text-xs leading-relaxed space-y-1.5 border-t pt-4">
              <p>
                การลบไซต์งานจะทำการลบข้อมูลเกตเวย์, อุปกรณ์มิเตอร์ และประวัติการอ่านค่าที่เกี่ยวข้องของไซต์นี้ทั้งหมด
              </p>
              <p className="text-[11px] text-warning-emphasis font-medium">
                * หากไซต์งานมีสัญญาหรือรอบบิลผูกอยู่ ระบบจะแจ้งให้ระงับการใช้งาน (Archive) แทนการลบถาวร
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-10 px-4 cursor-pointer"
          >
            {t("common.cancel")}
          </Button>

          {hasLinkedError ? (
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={() => handleDelete("archive")}
              className="text-xs h-10 px-4 gap-1.5 font-semibold cursor-pointer bg-warning text-warning-foreground hover:bg-warning/90 shadow-xs"
            >
              <Archive className="size-3.5" />
              <span>{locale === "th" ? "ระงับการใช้งาน (Archive)" : "Archive Site"}</span>
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => handleDelete("archive")}
                className="text-xs h-10 px-3 gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <Archive className="size-3.5" />
                <span>{locale === "th" ? "ระงับใช้งาน" : "Archive"}</span>
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={loading}
                onClick={() => handleDelete()}
                className="text-xs h-10 px-4 gap-1 font-semibold cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                <span>{loading ? t("common.deleting") : locale === "th" ? "ลบไซต์งาน" : "Delete Site"}</span>
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
