"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
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
  const [gatewayError,setGatewayError]=React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setGatewayError(false);
      setErrorMessage("");
    }
  }, [open]);

  const handleDelete = async () => {
    if (!site) return;
    setLoading(true);
    try {
      const res = await apiClient.delete<{ success: boolean; message: string; archived?: boolean }>(`/v1/sites/${encodeURIComponent(site.id)}`);
      notify.success(res.message || "ดำเนินการสำเร็จ");
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      const msg = err.message || "ไม่สามารถนำไซต์งานออกได้";
      setErrorMessage(msg);
      if(/active gateways|gateways first/i.test(msg)){setGatewayError(true);
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
                {locale === "th" ? "ยืนยันการนำไซต์งานออก" : "Remove Solar Site"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? `คุณต้องการนำไซต์งาน "${site?.name || ""}" ออกจากการใช้งานหรือไม่?`
                  : `Remove "${site?.name || ""}" from active use?`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {gatewayError ? <div className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-warning-emphasis"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0"/><div><p className="font-semibold">{locale==='th'?'ต้องนำเกตเวย์ออกก่อน':'Remove gateways first'}</p><p className="mt-1 text-[11px] leading-relaxed">{locale==='th'?'ไซต์นี้ยังมีเกตเวย์ที่ทำงานอยู่ ให้นำเกตเวย์ออกจากหน้าเกตเวย์แล้วจึงกลับมานำไซต์ออก':'This site still has an active gateway. Remove it from the gateway screen, then return to remove the site.'}</p><p className="mt-1 text-[11px]">{errorMessage}</p></div></div></div> : (
            <div className="text-muted-foreground text-xs leading-relaxed space-y-1.5 border-t pt-4">
              <p>{locale==='th'?'ระบบจะนำไซต์ออกจากการใช้งานและเก็บประวัติการเงินและโทรมาตรไว้':'The site will be removed from active use while financial and telemetry history is preserved.'}</p>
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

          {!gatewayError&&(
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={loading}
                onClick={handleDelete}
                className="text-xs h-10 px-4 gap-1 font-semibold cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                <span>{loading ? t("common.deleting") : locale === "th" ? "นำไซต์ออก" : "Remove Site"}</span>
              </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
