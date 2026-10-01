"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Calendar, FileText, Building2, UserCheck } from "lucide-react";
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
import { useAuth } from "../../stores/auth-store";

const contractSchema = z.object({
  siteId: z.string().min(1, "กรุณาเลือกไซต์งาน"),
  effectiveDate: z.string().min(1, "กรุณาระบุวันที่มีผล"),
  paymentTerms: z.string().min(1, "กรุณาระบุเงื่อนไขการชำระเงิน"),
  signerName: z.string().min(1, "กรุณาระบุชื่อผู้ลงนาม"),
  taxId: z.string().optional(),
  companyName: z.string().optional(),
  branch: z.string().optional(),
  taxAddress: z.string().optional(),
  billingEmail: z.string().optional(),
  billingPhone: z.string().optional(),
});

type ContractFormValues = z.infer<typeof contractSchema>;

interface SiteOption {
  id: string;
  name: string;
  schoolName?: string;
}

interface RateRow {
  startDate: string;
  endDate: string;
  rate: number | "";
}

export function ContractFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [loadingSites, setLoadingSites] = React.useState(false);
  const [sites, setSites] = React.useState<SiteOption[]>([]);
  const [rateRows, setRateRows] = React.useState<RateRow[]>([
    {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      rate: "",
    },
  ]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      siteId: "",
      effectiveDate: new Date().toISOString().slice(0, 10),
      paymentTerms: "",
      signerName: "",
      taxId: "",
      companyName: "",
      branch: "",
      taxAddress: "",
      billingEmail: "",
      billingPhone: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      setLoadingSites(true);
      apiClient
        .get<SiteOption[]>("/v1/sites")
        .then((siteList) => {
          if (Array.isArray(siteList)) {
            setSites(siteList);
            if (siteList[0]) {
              setValue("siteId", siteList[0].id, { shouldValidate: true });
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingSites(false));
    }
  }, [open, setValue]);

  const handleAddRateRow = () => {
    const lastRow = rateRows[rateRows.length - 1];
    const nextStart = lastRow?.endDate
      ? lastRow.endDate
      : new Date().toISOString().slice(0, 10);

    setRateRows((prev) => [
      ...prev,
      {
        startDate: nextStart,
        endDate: "",
        rate: "",
      },
    ]);
  };

  const handleRemoveRateRow = (index: number) => {
    if (rateRows.length <= 1) return;
    setRateRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRateRowChange = (index: number, field: keyof RateRow, val: any) => {
    setRateRows((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = { ...target, [field]: val };
      return copy;
    });
  };

  const onSubmit = async (values: ContractFormValues) => {
    setLoading(true);
    try {
      const payload = {
        siteId: values.siteId,
        siteIds: [values.siteId],
        effectiveDate: values.effectiveDate,
        paymentTerms: values.paymentTerms,
        signerName: values.signerName,
        taxId: values.taxId?.trim() || null,
        companyName: values.companyName?.trim() || null,
        branch: values.branch?.trim() || null,
        taxAddress: values.taxAddress?.trim() || null,
        billingEmail: values.billingEmail?.trim() || null,
        billingPhone: values.billingPhone?.trim() || null,
        ratePerKwh: Number(rateRows[0]?.rate),
        rates: rateRows.map((r) => ({
          startDate: r.startDate,
          endDate: r.endDate.trim() ? r.endDate : null,
          rate: Number(r.rate),
        })),
      };

      await apiClient.post("/v1/contracts", payload);

      notify.success(
        locale === "th"
          ? "สร้างสัญญาและตารางอัตราค่าไฟสำเร็จ"
          : "Created contract and rate schedule successfully"
      );
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการสร้างสัญญา");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:rounded-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "สร้างสัญญาซื้อขายไฟฟ้าและอัตราค่าไฟ (PPA)" : "Create PPA Contract & Rates"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "ระบุไซต์งาน ข้อมูลใบกำกับภาษี และกำหนดตารางอัตราค่าไฟแบบไดนามิก"
                  : "Specify solar site, tax invoice details, and dynamic tariff schedule"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Section 1: Site and Signer Information */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/50 pb-2">
              <Building2 className="size-4 text-primary" />
              <span>{locale === "th" ? "1. ข้อมูลไซต์งานและคู่สัญญา" : "1. Site & Signer Details"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-site" required className="text-xs font-medium">
                  {locale === "th" ? "เลือกไซต์งานติดตั้ง" : "Solar Site"}
                </Label>
                <Select
                  value={watch("siteId")}
                  onValueChange={(val) => setValue("siteId", val, { shouldValidate: true })}
                >
                  <SelectTrigger id="c-site" className="text-xs h-10 w-full bg-background">
                    <SelectValue placeholder={loadingSites ? "กำลังโหลดไซต์..." : "เลือกไซต์งาน"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} {s.schoolName ? `(${s.schoolName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.siteId && (
                  <p className="text-[11px] text-destructive">{errors.siteId.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="effective-date" required className="text-xs font-medium">
                  {locale === "th" ? "วันเริ่มต้นสัญญา" : "Contract Effective Date"}
                </Label>
                <DatePicker
                  id="effective-date"
                  value={watch("effectiveDate")}
                  onChange={(val) => setValue("effectiveDate", val, { shouldValidate: true })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="terms" required className="text-xs font-medium">
                  {locale === "th" ? "เงื่อนไขการชำระเงิน" : "Payment Terms"}
                </Label>
                <Input
                  id="terms"
                  placeholder="ชำระภายใน 30 วัน"
                  className="text-xs h-10 bg-background"
                  {...register("paymentTerms")}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="signer" required className="text-xs font-medium">
                  {locale === "th" ? "ผู้ลงนามฝ่ายผู้ให้บริการ" : "Authorized Signatory"}
                </Label>
                <Input
                  id="signer"
                  placeholder="Solar Platform Owner"
                  className="text-xs h-10 bg-background"
                  {...register("signerName")}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Tax Invoice & Customer Details */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/50 pb-2">
              <FileText className="size-4 text-primary" />
              <span>{locale === "th" ? "2. ข้อมูลออกใบกำกับภาษี / ใบเสร็จรับเงิน (Tax Info)" : "2. Tax Invoice Information"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tax-id" className="text-xs font-medium">
                  {locale === "th" ? "เลขประจำตัวผู้เสียภาษี (13 หลัก)" : "Tax ID"}
                </Label>
                <Input
                  id="tax-id"
                  placeholder="0105558123456"
                  className="text-xs h-10 font-mono bg-background"
                  {...register("taxId")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="branch" className="text-xs font-medium">
                  {locale === "th" ? "สาขา (Branch)" : "Branch"}
                </Label>
                <Input
                  id="branch"
                  placeholder="สำนักงานใหญ่ หรือ 00000"
                  className="text-xs h-10 bg-background"
                  {...register("branch")}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="company-name" className="text-xs font-medium">
                  {locale === "th" ? "ชื่อนิติบุคคล / สถานศึกษาตาม ภ.พ.20" : "Company / School Entity Name"}
                </Label>
                <Input
                  id="company-name"
                  placeholder="โรงเรียนมัธยมดอนทอง หรือ บจก. พลังงานโซลาร์"
                  className="text-xs h-10 bg-background"
                  {...register("companyName")}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tax-address" className="text-xs font-medium">
                  {locale === "th" ? "ที่อยู่จดทะเบียนสำหรับใบกำกับภาษี" : "Tax Registered Address"}
                </Label>
                <Input
                  id="tax-address"
                  placeholder="เลขที่ 123 หมู่ 4 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000"
                  className="text-xs h-10 bg-background"
                  {...register("taxAddress")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="billing-email" className="text-xs font-medium">
                  {locale === "th" ? "อีเมลรับใบแจ้งหนี้ / ใบกำกับภาษี" : "Billing Email"}
                </Label>
                <Input
                  id="billing-email"
                  type="email"
                  placeholder="finance@school.ac.th"
                  className="text-xs h-10 bg-background"
                  {...register("billingEmail")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="billing-phone" className="text-xs font-medium">
                  {locale === "th" ? "เบอร์โทรศัพท์ติดต่อการเงิน" : "Billing Phone"}
                </Label>
                <Input
                  id="billing-phone"
                  placeholder="02-123-4567"
                  className="text-xs h-10 bg-background"
                  {...register("billingPhone")}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Rate Schedule Table */}
          <div className="rounded-xl border border-border/70 bg-card p-3.5 space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                <span>{locale === "th" ? "3. ตารางอัตราค่าไฟตามช่วงเวลา (Dynamic Rate Schedule)" : "3. Rate Schedule"}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRateRow}
                className="h-8 gap-1 text-xs px-2.5 bg-background cursor-pointer"
              >
                <Plus className="size-3.5 text-primary" />
                <span>{locale === "th" ? "เพิ่มช่วงเวลา" : "Add Rate Period"}</span>
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase">
                  <tr>
                    <th className="p-2.5 pl-3">{locale === "th" ? "วันเริ่มต้น" : "Start Date"}</th>
                    <th className="p-2.5">{locale === "th" ? "วันสิ้นสุด (เว้นว่าง = ไม่มีกำหนด)" : "End Date (Blank = Ongoing)"}</th>
                    <th className="p-2.5 w-32">{locale === "th" ? "อัตรา (฿/kWh)" : "Rate (฿/kWh)"}</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rateRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="p-2 pl-3">
                        <Input
                          type="date"
                          value={row.startDate}
                          onChange={(e) => handleRateRowChange(idx, "startDate", e.target.value)}
                          className="h-8 text-xs font-mono bg-background"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="date"
                          value={row.endDate}
                          onChange={(e) => handleRateRowChange(idx, "endDate", e.target.value)}
                          placeholder="ไม่มีกำหนด"
                          className="h-8 text-xs font-mono bg-background"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={row.rate}
                          required
                          min="0"
                          aria-label={locale === "th" ? "อัตราค่าไฟที่ตกลง" : "Agreed tariff"}
                          onChange={(e) => handleRateRowChange(idx, "rate", e.target.value === "" ? "" : Number(e.target.value))}
                          className="h-8 text-xs font-mono font-bold text-primary bg-background"
                        />
                      </td>
                      <td className="p-2 pr-3 text-center">
                        {rateRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRateRow(idx)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            title="ลบแถวนี้"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {locale === "th"
                ? "* หากเว้นว่างวันสิ้นสุด อัตราค่าไฟนั้นจะมีผลต่อเนื่องจนกว่าจะมีอัตราค่าไฟช่วงถัดไปกำหนดขึ้น"
                : "* Leaving end date blank marks the rate as open-ended until superseded by a newer version"}
            </p>
          </div>

          <DialogFooter className="pt-2">
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
              {loading ? t("common.saving") : locale === "th" ? "บันทึกสัญญาและอัตราค่าไฟ" : "Save Contract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
