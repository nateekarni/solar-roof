"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import { DatePicker } from "../../components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
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

const billingSchema = z
  .object({
    siteId: z.string().min(1, "กรุณาเลือกไซต์"),
    periodStart: z.string().min(1, "กรุณาระบุวันเริ่มต้นรอบบิล"),
    periodEnd: z.string().min(1, "กรุณาระบุวันสิ้นสุดรอบบิล"),
  })
  .refine(
    (data) => {
      if (!data.periodStart || !data.periodEnd) return true;
      return new Date(data.periodEnd) > new Date(data.periodStart);
    },
    {
      message: "วันสิ้นสุดรอบบิลต้องมากกว่าวันเริ่มต้น",
      path: ["periodEnd"],
    }
  );

type BillingFormValues = z.infer<typeof billingSchema>;

interface SiteOption {
  id: string;
  name: string;
}

export function BillingCycleDialog({
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
  const [loadingSites, setLoadingSites] = React.useState(false);
  const [sites, setSites] = React.useState<SiteOption[]>([]);

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BillingFormValues>({
    resolver: zodResolver(billingSchema),
    defaultValues: {
      siteId: "",
      periodStart: defaultStart,
      periodEnd: defaultEnd,
    },
  });

  React.useEffect(() => {
    if (open) {
      setLoadingSites(true);
      apiClient
        .get<SiteOption[]>("/v1/sites")
        .then((data) => {
          setSites(data);
          if (data.length > 0 && data[0]) {
            setValue("siteId", data[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingSites(false));
    }
  }, [open, setValue]);

  const onSubmit = async (values: BillingFormValues) => {
    setLoading(true);
    try {
      await apiClient.post("/v1/billing-cycles", values);
      notify.success(
        locale === "th"
          ? "สร้างรอบบิลใหม่เรียบร้อยแล้ว"
          : "Billing cycle created successfully"
      );
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการสร้างรอบบิล");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "สร้างรอบบิลใหม่" : "Create Billing Cycle"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "คำนวณและสร้างรอบบิลค่าไฟฟ้าประจำเดือนสำหรับไซต์"
              : "Generate monthly electricity billing cycle for a site"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="site-select" required className="text-xs font-medium">
              {locale === "th" ? "ไซต์พลังงาน" : "Solar Site"}
            </Label>
            <Select onValueChange={(val) => setValue("siteId", val)}>
              <SelectTrigger id="site-select" className="text-xs h-10 w-full">
                <SelectValue placeholder={loadingSites ? "กำลังโหลดไซต์..." : "เลือกไซต์"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.siteId && (
              <p className="text-[11px] text-destructive">{errors.siteId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" required className="text-xs font-medium">
                {locale === "th" ? "วันเริ่มต้น" : "Start Date"}
              </Label>
              <DatePicker
                id="start-date"
                value={watch("periodStart")}
                onChange={(val) => setValue("periodStart", val, { shouldValidate: true })}
              />
              {errors.periodStart && (
                <p className="text-[11px] text-destructive">{errors.periodStart.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="end-date" required className="text-xs font-medium">
                {locale === "th" ? "วันสิ้นสุด" : "End Date"}
              </Label>
              <DatePicker
                id="end-date"
                value={watch("periodEnd")}
                onChange={(val) => setValue("periodEnd", val, { shouldValidate: true })}
              />
              {errors.periodEnd && (
                <p className="text-[11px] text-destructive">{errors.periodEnd.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 px-4"
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="text-xs h-10 px-5 font-semibold">
              {loading ? t("common.saving") : t("common.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
