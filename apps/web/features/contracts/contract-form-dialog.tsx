"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { notify } from "../../components/feedback/notifications";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
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
  siteIds: z.array(z.string()).min(1, "กรุณาเลือกไซต์อย่างน้อย 1 ไซต์"),
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
  const [sitePopoverOpen, setSitePopoverOpen] = React.useState(false);

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
      schoolId: "",
      siteIds: [],
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
            const firstSchoolId = schoolList[0].id;
            setValue("schoolId", firstSchoolId);
            setSelectedSchoolId(firstSchoolId);
            const matchingSites = siteList.filter((s) => s.schoolId === firstSchoolId);
            const initialSiteIds = matchingSites.map((s) => s.id);
            setValue("siteIds", initialSiteIds, { shouldValidate: true });
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
    const allSiteIds = matchingSites.map((s) => s.id);
    setValue("siteIds", allSiteIds, { shouldValidate: true });
  };

  const filteredSites = selectedSchoolId
    ? sites.filter((s) => s.schoolId === selectedSchoolId)
    : sites;

  const selectedSiteIds = watch("siteIds") || [];

  const toggleSite = (siteId: string) => {
    const current = watch("siteIds") || [];
    const next = current.includes(siteId)
      ? current.filter((id) => id !== siteId)
      : [...current, siteId];
    setValue("siteIds", next, { shouldValidate: true });
  };

  const toggleSelectAllSites = () => {
    const allIds = filteredSites.map((s) => s.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSiteIds.includes(id));
    if (allSelected) {
      setValue("siteIds", [], { shouldValidate: true });
    } else {
      setValue("siteIds", allIds, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: ContractFormValues) => {
    setLoading(true);
    try {
      const { schoolId: _stripped, ...contractPayload } = values;
      await apiClient.post("/v1/contracts", contractPayload);
      notify.success(
        locale === "th"
          ? `สร้างสัญญาสำหรับ ${values.siteIds.length} ไซต์สำเร็จ`
          : `Created contracts for ${values.siteIds.length} sites successfully`
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
      <DialogContent className="sm:max-w-xl sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "สร้างสัญญาและอัตราค่าไฟใหม่" : "Create Contract & Rate"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "สร้างฉบับร่างสัญญาซื้อขายไฟฟ้าและระบุอัตราค่าไฟต่อหน่วย"
              : "Create PPA contract version and configure unit rate for a site"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="c-school" required className="text-xs font-medium">
              {locale === "th" ? "โรงเรียนคู่สัญญา" : "Contracted School"}
            </Label>
            <Select value={selectedSchoolId} onValueChange={handleSchoolChange}>
              <SelectTrigger id="c-school" className="text-xs h-10 w-full">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="c-site" required className="text-xs font-medium">
                {locale === "th" ? "ไซต์พลังงาน (เลือกได้หลายไซต์)" : "Solar Sites (Multi-select)"}
              </Label>
              {filteredSites.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllSites}
                  className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                >
                  {filteredSites.length > 0 && filteredSites.every((s) => selectedSiteIds.includes(s.id))
                    ? locale === "th"
                      ? "ยกเลิกทั้งหมด"
                      : "Deselect All"
                    : locale === "th"
                      ? `เลือกทั้งหมด (${filteredSites.length} ไซต์)`
                      : `Select All (${filteredSites.length})`}
                </button>
              )}
            </div>

            <Popover open={sitePopoverOpen} onOpenChange={setSitePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="c-site"
                  type="button"
                  variant="outline"
                  className="w-full h-10 justify-between text-xs font-normal bg-background px-3"
                >
                  <span className="truncate">
                    {selectedSiteIds.length === 0
                      ? locale === "th"
                        ? "เลือกไซต์พลังงาน..."
                        : "Select sites..."
                      : selectedSiteIds.length === filteredSites.length && filteredSites.length > 0
                        ? locale === "th"
                          ? `ทุกไซต์ในโรงเรียนนี้ (${selectedSiteIds.length} ไซต์)`
                          : `All sites in school (${selectedSiteIds.length})`
                        : locale === "th"
                          ? `เลือกแล้ว ${selectedSiteIds.length} ไซต์ (${selectedSiteIds
                              .map((id) => filteredSites.find((s) => s.id === id)?.name)
                              .filter(Boolean)
                              .join(", ")})`
                          : `${selectedSiteIds.length} sites selected`}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 space-y-1" align="start">
                {filteredSites.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground text-center">
                    {loadingOptions
                      ? locale === "th"
                        ? "กำลังโหลดไซต์..."
                        : "Loading sites..."
                      : locale === "th"
                        ? "ไม่มีไซต์ภายใต้โรงเรียนนี้"
                        : "No sites under this school"}
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {filteredSites.map((site) => {
                      const checked = selectedSiteIds.includes(site.id);
                      return (
                        <div
                          key={site.id}
                          onClick={() => toggleSite(site.id)}
                          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 cursor-pointer select-none transition-colors"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSite(site.id)}
                            className="pointer-events-none"
                          />
                          <span className="flex-1 font-medium">{site.name}</span>
                          {checked && <Check className="size-3.5 text-primary shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {errors.siteIds && (
              <p className="text-[11px] text-destructive">{errors.siteIds.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="effective-date" required className="text-xs font-medium">
                {locale === "th" ? "วันที่มีผล" : "Effective Date"}
              </Label>
              <DatePicker
                id="effective-date"
                value={watch("effectiveDate")}
                onChange={(val) => setValue("effectiveDate", val, { shouldValidate: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate" required className="text-xs font-medium">
                {locale === "th" ? "อัตราค่าไฟ (฿/kWh)" : "Rate (THB/kWh)"}
              </Label>
              <Input
                id="rate"
                type="number"
                step="0.01"
                placeholder="4.25"
                className="text-xs h-10"
                {...register("ratePerKwh", { valueAsNumber: true })}
              />
              {errors.ratePerKwh && (
                <p className="text-[11px] text-destructive">{errors.ratePerKwh.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="terms" required className="text-xs font-medium">
                {locale === "th" ? "เงื่อนไขการชำระ" : "Payment Terms"}
              </Label>
              <Input
                id="terms"
                placeholder="ชำระภายใน 30 วัน"
                className="text-xs h-10"
                {...register("paymentTerms")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signer" required className="text-xs font-medium">
                {locale === "th" ? "ผู้ลงนาม" : "Signatory"}
              </Label>
              <Input
                id="signer"
                placeholder="Solar Platform Owner"
                className="text-xs h-10"
                {...register("signerName")}
              />
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
