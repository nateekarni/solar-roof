"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

const reportSchema = z.object({
  type: z.string().min(1, "กรุณาเลือกประเภทรายงาน"),
  dateFrom: z.string().min(1, "กรุณาระบุวันที่เริ่มต้น"),
  dateTo: z.string().min(1, "กรุณาระบุวันที่สิ้นสุด"),
  format: z.string().min(1, "กรุณาเลือกรูปแบบไฟล์"),
});

type ReportFormValues = z.infer<typeof reportSchema>;

export function GenerateReportDialog({
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

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      type: "energy",
      dateFrom: defaultFrom,
      dateTo: defaultTo,
      format: "csv",
    },
  });

  const onSubmit = async (values: ReportFormValues) => {
    setLoading(true);
    try {
      await apiClient.post("/v1/reports", values);
      notify.success(
        locale === "th"
          ? "สร้างรายงานสำเร็จ ระบบได้นำข้อมูลเข้าสู่คิวเรียบร้อย"
          : "Report generated successfully"
      );
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการสร้างรายงาน");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "สร้างรายงานข้อมูล" : "Generate Report"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "ประมวลผลและส่งออกรายงานสถิติพลังงาน อุปกรณ์ หรือการเงิน"
              : "Generate and export energy production, equipment health or financial reports"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="r-type" className="text-xs font-medium">
              {locale === "th" ? "ประเภทรายงาน *" : "Report Type *"}
            </Label>
            <Select defaultValue="energy" onValueChange={(val) => setValue("type", val)}>
              <SelectTrigger id="r-type" className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="energy" className="text-xs">
                  {locale === "th" ? "รายงานการผลิตพลังงาน (Energy)" : "Energy Production"}
                </SelectItem>
                <SelectItem value="device" className="text-xs">
                  {locale === "th" ? "รายงานสถานะอุปกรณ์และเกตเวย์ (Devices)" : "Device & Gateway Health"}
                </SelectItem>
                <SelectItem value="financial" className="text-xs">
                  {locale === "th" ? "รายงานการเงินและรอบบิล (Billing)" : "Billing & Financial"}
                </SelectItem>
                <SelectItem value="payment" className="text-xs">
                  {locale === "th" ? "รายงานการรับชำระเงิน (Payments)" : "Payment Collections"}
                </SelectItem>
                <SelectItem value="audit" className="text-xs">
                  {locale === "th" ? "รายงานประวัติการทำงาน (Audit Trail)" : "Audit Trail Events"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date-from" className="text-xs font-medium">
                {locale === "th" ? "ตั้งแต่วันที่ *" : "From Date *"}
              </Label>
              <Input
                id="date-from"
                type="date"
                className="text-xs h-9"
                {...register("dateFrom")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-to" className="text-xs font-medium">
                {locale === "th" ? "ถึงวันที่ *" : "To Date *"}
              </Label>
              <Input
                id="date-to"
                type="date"
                className="text-xs h-9"
                {...register("dateTo")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-format" className="text-xs font-medium">
              {locale === "th" ? "รูปแบบไฟล์ *" : "File Format *"}
            </Label>
            <Select defaultValue="csv" onValueChange={(val) => setValue("format", val)}>
              <SelectTrigger id="r-format" className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv" className="text-xs">CSV (.csv)</SelectItem>
                <SelectItem value="pdf" className="text-xs">PDF Document (.pdf)</SelectItem>
                <SelectItem value="xlsx" className="text-xs">Excel Spreadsheet (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-9"
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="text-xs h-9 font-semibold">
              {loading ? t("common.saving") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
