"use client";

import { AddButton } from "../../components/ui/add-button";

import { Download } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import * as React from "react";
import { notify } from "../../components/feedback/notifications";
import { DatePicker } from "../../components/ui/date-picker";
import { Field, FieldLabel } from "../../components/ui/field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { canCreateOperation } from "./business-operation-options";
import { FinancialAvailabilityNotice } from "./financial-availability-notice";
import { useSessionUser } from "../../providers/session-user-provider";

// Import all 9 Dialogs
import { AcknowledgeDialog } from "../alerts/acknowledge-dialog";
import { BillingCycleDialog } from "../billing/billing-cycle-dialog";
import { ContractFormDialog } from "../contracts/contract-form-dialog";
import { NotificationSettingsDialog } from "../notifications/notification-settings-dialog";
import { GenerateReportDialog } from "../reports/generate-report-dialog";
import { SchoolFormDialog } from "../schools/school-form-dialog";
import {SiteEditDialog} from "../sites/site-edit-dialog";
import { SiteFormDialog } from "../sites/site-form-dialog";
import { InviteUserDialog } from "../users/invite-user-dialog";

export function OperationActions({
  resource,
  title,
  action,
}: {
  resource: string;
  title: string;
  action?: string | undefined;
}) {
  const t = useT();
  const locale = useLocale();
  const user = useSessionUser();
  const financial = useFinancialCapabilities();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportFrom, setExportFrom] = React.useState("");
  const [exportTo, setExportTo] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [billingSiteId,setBillingSiteId]=React.useState<string|null>(null);
  const handleCreatedSite=React.useCallback((siteId:string)=>setBillingSiteId(siteId),[]);
  const handleBillingOpenChange=React.useCallback((open:boolean)=>{if(!open)setBillingSiteId(null);},[]);

  const financialAction = resource === "billing" ? "calculate" : resource === "contracts" ? "create_contract" : resource === "documents" || resource === "receipts" ? "issue" : undefined;
  const canCreate = canCreateOperation(resource, user, financial.actions);

  React.useEffect(() => {
    const act = searchParams.get("action");
    if (canCreate && (act === "new" || act === "create")) {
      setDialogOpen(true);
    }
  }, [searchParams, canCreate]);

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && searchParams.get("action")) {
      router.replace(pathname, { scroll: false });
    }
  };

  const handleExport = async () => {
    if (exporting || !exportFrom || !exportTo || exportFrom > exportTo) return;
    setExporting(true);
    try {
      const query = new URLSearchParams(searchParams.toString());
      query.delete('cursor');query.delete('action');query.delete('limit');query.set('from',exportFrom);query.set('to',exportTo);
      const blob = await apiClient.getBlob(`/v1/operations/${resource}/export?${query}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
        a.download = `${resource}-${exportFrom}-${exportTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportOpen(false);
      notify.success(
        locale === "th"
          ? `ดาวน์โหลดไฟล์ ${resource}.csv สำเร็จ`
          : `Downloaded ${resource}.csv successfully`
      );
    } catch (err: any) {
      notify.error(err.message || "ไม่สามารถส่งออกไฟล์ CSV ได้");
    } finally {
      setExporting(false);
    }
  };

  const handleActionClick = () => {
    if (resource === "audit") {
      setExportOpen(true);
      return;
    }
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={() => {setExportFrom(searchParams.get("from") ?? "");setExportTo(searchParams.get("to") ?? "");setExportOpen(true);}}
          className="h-10 gap-2 px-4 text-sm"
        >
          <Download className="size-3.5" />
            <span>{exporting ? t("common.loading") : locale === 'th' ? 'นำออกข้อมูล' : 'Export data'}</span>
        </Button>

        {canCreate && action && action.trim() !== "" && (
          <AddButton
            type="button"

            onClick={handleActionClick}
            className=" font-semibold shadow-xs cursor-pointer"
          >

            <span>{action}</span>
          </AddButton>
        )}
</div>
      {financialAction && financial.unavailable[financialAction] && (
        <FinancialAvailabilityNotice locale={locale} role={user.role} resource={resource} />
      )}

      <Dialog open={exportOpen} onOpenChange={(open: boolean) => {if (!exporting) setExportOpen(open);}}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "th" ? "นำออกข้อมูล" : "Export data"}</DialogTitle><DialogDescription>{locale === "th" ? "เลือกช่วงวันที่เพื่อดาวน์โหลดทุกรายการที่ตรงกับการค้นหา (เวลาไทย)" : "Download all matching records in the selected date range (Bangkok time)."}</DialogDescription></DialogHeader>
          <p className="text-sm text-muted-foreground">{locale === "th" ? ({sites:"อ้างอิงวันที่สร้างไซต์",schools:"อ้างอิงวันที่สร้างองค์กร",users:"อ้างอิงวันที่สร้างผู้ใช้",billing:"อ้างอิงเดือนรอบบิลที่อยู่ในช่วงวันที่",contracts:"อ้างอิงวันที่เริ่มสัญญา",documents:"อ้างอิงวันที่ออกเอกสาร",receipts:"อ้างอิงวันที่ออกใบเสร็จ",alerts:"อ้างอิงวันที่เกิดการแจ้งเตือน",notifications:"อ้างอิงวันที่แจ้งเตือน",reports:"อ้างอิงวันที่สร้างรายงาน",audit:"อ้างอิงวันที่เกิดกิจกรรม"} as Record<string,string>)[resource] : ({sites:"Site creation date",schools:"Organization creation date",users:"User creation date",billing:"Billing months included in the date range",contracts:"Contract start date",documents:"Document issue date",receipts:"Receipt issue date",alerts:"Alert occurrence date",notifications:"Notification date",reports:"Report creation date",audit:"Activity date"} as Record<string,string>)[resource]}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="export-from" required>{locale === "th" ? "วันที่เริ่มต้น" : "Start date"}</FieldLabel><DatePicker id="export-from" value={exportFrom} onChange={setExportFrom} max={exportTo || undefined}/></Field>
            <Field><FieldLabel htmlFor="export-to" required>{locale === "th" ? "วันที่สิ้นสุด" : "End date"}</FieldLabel><DatePicker id="export-to" value={exportTo} onChange={setExportTo} min={exportFrom || undefined}/></Field>
          </div>
          <DialogFooter><Button className="h-10 px-5" variant="outline" disabled={exporting} onClick={()=>setExportOpen(false)}>{locale === "th" ? "ยกเลิก" : "Cancel"}</Button><Button className="h-10 px-5" disabled={exporting || !exportFrom || !exportTo || exportFrom > exportTo} onClick={()=>void handleExport()}><Download aria-hidden="true"/>{exporting ? t("common.loading") : locale === "th" ? "นำออกข้อมูล" : "Export data"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Render matching Dialog based on resource */}
      {resource === "schools" && (
        <SchoolFormDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "sites" && canCreate && (
        <><SiteFormDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} onCreated={handleCreatedSite}/><SiteEditDialog open={Boolean(billingSiteId)} onOpenChange={handleBillingOpenChange} siteId={billingSiteId} billingSetupPending/></>
      )}
      {resource === "billing" && canCreate && (
        <BillingCycleDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "contracts" && canCreate && (
        <ContractFormDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "reports" && (
        <GenerateReportDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "alerts" && (
        <AcknowledgeDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "notifications" && (
        <NotificationSettingsDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "users" && (
        <InviteUserDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
    </div>
  );
}
