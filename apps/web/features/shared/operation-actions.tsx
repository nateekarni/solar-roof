"use client";

import { Download, Plus } from "lucide-react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import * as React from "react";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";
import { useFinancialCapabilities } from "../../lib/financial-capabilities";
import { useAuth } from "../../stores/auth-store";

// Import all 9 Dialogs
import { AcknowledgeDialog } from "../alerts/acknowledge-dialog";
import { BillingCycleDialog } from "../billing/billing-cycle-dialog";
import { ContractFormDialog } from "../contracts/contract-form-dialog";
import { NotificationSettingsDialog } from "../notifications/notification-settings-dialog";
import { GenerateReportDialog } from "../reports/generate-report-dialog";
import { SchoolFormDialog } from "../schools/school-form-dialog";
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
  const { user } = useAuth();
  const financial = useFinancialCapabilities();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [exporting, setExporting] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const financialAction = resource === "billing" ? "calculate" : resource === "contracts" ? "create_contract" : resource === "documents" || resource === "receipts" ? "issue" : undefined;
  const canCreate = financialAction ? financial.actions.includes(financialAction) : resource !== "sites" || (user?.role === "admin" && !user.schoolId);

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
    setExporting(true);
    try {
      const blob = await apiClient.getBlob(`/v1/operations/${resource}/export`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      handleExport();
      return;
    }
    setDialogOpen(true);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={handleExport}
        className="h-9 gap-1.5 text-xs font-medium bg-white text-foreground hover:bg-neutral-50 dark:bg-card dark:text-card-foreground border border-border shadow-xs cursor-pointer"
      >
        <Download className="size-3.5" />
        <span>{exporting ? t("common.loading") : t("common.exportCsv")}</span>
      </Button>

      {financialAction && financial.unavailable[financialAction] && <p role="status" className="text-xs text-muted-foreground">{financial.unavailable[financialAction]}</p>}
      {canCreate && action && action.trim() !== "" && (
        <Button
          type="button"
          size="sm"
          onClick={handleActionClick}
          className="h-9 gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>{action}</span>
        </Button>
      )}

      {/* Render matching Dialog based on resource */}
      {resource === "schools" && (
        <SchoolFormDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
      )}
      {resource === "sites" && canCreate && (
        <SiteFormDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} />
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
