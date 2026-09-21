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
import { useAuth } from "../../stores/auth-store";

const contractSchema = z.object({
  schoolId: z.string().min(1, "กรุณาเลือกโรงเรียน"),
  siteId: z.string().min(1, "กรุณาเลือกไซต์"),
  effectiveDate: z.string().min(1, "กรุณาระบุวันที่มีผล"),
  ratePerKwh: z.number().min(0.01, "อัตราค่าไฟต้องมากกว่า 0"),
  paymentTerms: z.string().min(1, "กรุณาระบุเงื่อนไขการชำระเงิน"),
  signerName: z.string().min(1, "กรุณาระบุชื่อผู้ลงนาม"),
});

type ContractFormValues = z.infer<typeof contractSchema>;

interface Option {
  id: string;
  name: string;
  schoolId?: string;
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
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [schools, setSchools] = React.useState<Option[]>([]);
  const [sites, setSites] = React.useState<Option[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = React.useState<string>("");

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      schoolId: "",
      siteId: "",
      effectiveDate: new Date().toISOString().slice(0, 10),
      ratePerKwh: 4.25,
      paymentTerms: "ชำระภายใน 30 วัน",
      signerName: user?.displayName || "Admin User",
    },
  });

  React.useEffect(() => {
    if (user?.displayName) {
      setValue("signerName", user.displayName);
    }
  }, [user, setValue]);

  React.useEffect(() => {
    if (open) {
      setLoadingOptions(true);
      Promise.all([
        apiClient.get<Option[]>("/v1/schools"),
        apiClient.get<Option[]>("/v1/sites"),
      ])
        .then(([schoolList, siteList]) => {
          setSchools(schoolList);
          setSites(siteList);
          if (schoolList[0]) {
            setValue("schoolId", schoolList[0].id);
            setSelectedSchoolId(schoolList[0].id);
            const matchingSites = siteList.filter((s) => s.schoolId === schoolList[0]!.id);
            if (matchingSites[0]) {
              setValue("siteId", matchingSites[0].id);
            } else if (siteList[0]) {
              setValue("siteId", siteList[0].id);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingOptions(false));
    }
  }, [open, setValue]);

  const handleSchoolChange = (schoolId: string) => {
    setValue("schoolId", schoolId);
    setSelectedSchoolId(schoolId);
    const matchingSites = sites.filter((s) => s.schoolId === schoolId);
    if (matchingSites[0]) {
      setValue("siteId", matchingSites[0].id);
    } else {
      setValue("siteId", "");
    }
  };

  const filteredSites = selectedSchoolId
    ? sites.filter((s) => s.schoolId === selectedSchoolId)
    : sites;

  const onSubmit = async (values: ContractFormValues) => {
    setLoading(true);
    try {
      // Q3 Decision B: Do not send schoolId to API; Contract is site-scoped
      const { schoolId: _stripped, ...contractPayload } = values;
      await apiClient.post("/v1/contracts", contractPayload);
      notify.success(
        locale === "th"
          ? "สร้างสัญญาและกำหนดอัตราค่าไฟสำเร็จ"
          : "Contract and rate version created successfully"
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
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "สร้างสัญญาและอัตราค่าไฟใหม่" : "Create Contract & Rate"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "สร้างฉบับร่างสัญญาซื้อขายไฟฟ้าและระบุอัตราค่าไฟต่อหน่วย"
              : "Create PPA contract version and configure unit rate for a site"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-school" className="text-xs font-medium">
              {locale === "th" ? "โรงเรียนคู่สัญญา *" : "Contracted School *"}
            </Label>
            <Select value={selectedSchoolId} onValueChange={handleSchoolChange}>
              <SelectTrigger id="c-school" className="text-xs h-9">
                <SelectValue placeholder={loadingOptions ? "กำลังโหลดโรงเรียน..." : "เลือกโรงเรียน"} />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.schoolId && (
              <p className="text-[11px] text-destructive">{errors.schoolId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-site" className="text-xs font-medium">
              {locale === "th" ? "ไซต์พลังงาน *" : "Solar Site *"}
            </Label>
            <Select onValueChange={(val) => setValue("siteId", val)}>
              <SelectTrigger id="c-site" className="text-xs h-9">
                <SelectValue placeholder={loadingOptions ? "กำลังโหลดไซต์..." : filteredSites.length === 0 ? "ไม่มีไซต์ในโรงเรียนนี้" : "เลือกไซต์"} />
              </SelectTrigger>
              <SelectContent>
                {filteredSites.map((s) => (
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
              <Label htmlFor="effective-date" className="text-xs font-medium">
                {locale === "th" ? "วันที่มีผล *" : "Effective Date *"}
              </Label>
              <Input
                id="effective-date"
                type="date"
                className="text-xs h-9"
                {...register("effectiveDate")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate" className="text-xs font-medium">
                {locale === "th" ? "อัตราค่าไฟ (฿/kWh) *" : "Rate (THB/kWh) *"}
              </Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                placeholder="4.25"
                className="text-xs h-9"
                {...register("ratePerKwh", { valueAsNumber: true })}
              />
              {errors.ratePerKwh && (
                <p className="text-[11px] text-destructive">{errors.ratePerKwh.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="terms" className="text-xs font-medium">
                {locale === "th" ? "เงื่อนไขการชำระ *" : "Payment Terms *"}
              </Label>
              <Input
                id="terms"
                placeholder="ชำระภายใน 30 วัน"
                className="text-xs h-9"
                {...register("paymentTerms")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer" className="text-xs font-medium">
                {locale === "th" ? "ผู้ลงนาม *" : "Signatory *"}
              </Label>
              <Input
                id="signer"
                placeholder="Solar Platform Owner"
                className="text-xs h-9"
                {...register("signerName")}
              />
            </div>
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
