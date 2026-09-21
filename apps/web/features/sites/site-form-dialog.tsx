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

const siteSchema = z.object({
  name: z.string().min(2, "ชื่อไซต์ต้องมีอย่างน้อย 2 ตัวอักษร"),
  schoolId: z.string().min(1, "กรุณาเลือกโรงเรียนสังกัด"),
  capacityMwp: z.number().min(0.01, "กำลังติดตั้งต้องมากกว่า 0"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

type SiteFormValues = z.infer<typeof siteSchema>;

interface SchoolOption {
  id: string;
  name: string;
}

export function SiteFormDialog({
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
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: "",
      schoolId: "",
      capacityMwp: 0.48,
      latitude: 13.7563,
      longitude: 100.5018,
    },
  });

  React.useEffect(() => {
    if (open) {
      apiClient
        .get<SchoolOption[]>("/v1/schools")
        .then((data) => {
          setSchools(data);
          if (data.length > 0 && data[0]) {
            setValue("schoolId", data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [open, setValue]);

  const onSubmit = async (values: SiteFormValues) => {
    setLoading(true);
    try {
      await apiClient.post("/v1/sites", values);
      notify.success(
        locale === "th"
          ? `เพิ่มไซต์พลังงาน "${values.name}" เรียบร้อยแล้ว`
          : `Solar Site "${values.name}" added successfully`
      );
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "เพิ่มไซต์พลังงานใหม่" : "Add New Solar Site"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "สร้างไซต์ติดตั้งโซลาร์รูฟท็อปและเชื่อมโยงเข้ากับโรงเรียน"
              : "Register a solar rooftop site and associate it with a school"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-name" className="text-xs font-medium">
              {locale === "th" ? "ชื่อไซต์ *" : "Site Name *"}
            </Label>
            <Input
              id="site-name"
              placeholder={locale === "th" ? "เช่น Solar Site 019 - อาคารเรียน 1" : "e.g. Solar Site 019 - Building A"}
              className="text-xs h-9"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-[11px] text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="school-select" className="text-xs font-medium">
              {locale === "th" ? "โรงเรียนสังกัด *" : "Associated School *"}
            </Label>
            <Select onValueChange={(val) => setValue("schoolId", val)}>
              <SelectTrigger id="school-select" className="text-xs h-9">
                <SelectValue placeholder="เลือกโรงเรียน" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((sch) => (
                  <SelectItem key={sch.id} value={sch.id} className="text-xs">
                    {sch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.schoolId && (
              <p className="text-[11px] text-destructive">{errors.schoolId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="capacity" className="text-xs font-medium">
              {locale === "th" ? "กำลังการผลิตติดตั้ง (MWp) *" : "Installed Capacity (MWp) *"}
            </Label>
            <Input
              id="capacity"
              type="number"
              step="0.01"
              placeholder="0.48"
              className="text-xs h-9"
              {...register("capacityMwp", { valueAsNumber: true })}
            />
            {errors.capacityMwp && (
              <p className="text-[11px] text-destructive">{errors.capacityMwp.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lat" className="text-xs font-medium">
                {locale === "th" ? "ละติจูด (Latitude)" : "Latitude"}
              </Label>
              <Input
                id="lat"
                type="number"
                step="0.0001"
                placeholder="13.7563"
                className="text-xs h-9"
                {...register("latitude", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lng" className="text-xs font-medium">
                {locale === "th" ? "ลองจิจูด (Longitude)" : "Longitude"}
              </Label>
              <Input
                id="lng"
                type="number"
                step="0.0001"
                placeholder="100.5018"
                className="text-xs h-9"
                {...register("longitude", { valueAsNumber: true })}
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
