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

const schoolSchema = z.object({
  name: z.string().min(2, "ชื่อโรงเรียนต้องมีอย่างน้อย 2 ตัวอักษร"),
  region: z.string().min(1, "กรุณาเลือกภูมิภาค"),
});

type SchoolFormValues = z.infer<typeof schoolSchema>;

const regions = [
  "ภาคกลาง",
  "ภาคตะวันออกเฉียงเหนือ",
  "ภาคเหนือ",
  "ภาคตะวันออก",
  "ภาคใต้",
  "ภาคตะวันตก",
];

export function SchoolFormDialog({
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

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: "",

    },
  });

  const onSubmit = async (values: SchoolFormValues) => {
    setLoading(true);
    try {
      await apiClient.post("/v1/schools", values);
      notify.success(
        locale === "th"
          ? `เพิ่มโรงเรียน "${values.name}" เรียบร้อยแล้ว`
          : `School "${values.name}" added successfully`
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
      <DialogContent className="sm:max-w-lg sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base font-semibold">
            {locale === "th" ? "เพิ่มโรงเรียนใหม่" : "Add New School"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "กรอกข้อมูลโรงเรียนเพื่อลงทะเบียนเข้าสู่ระบบแพลตฟอร์ม"
              : "Enter school information to register on the platform"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3.5">
          <div className="space-y-2">
            <Label htmlFor="school-name" required className="text-xs font-medium">
              {locale === "th" ? "ชื่อโรงเรียน" : "School Name"}
            </Label>
            <Input
              id="school-name"
              placeholder={locale === "th" ? "เช่น โรงเรียนอนุบาลสาธิต" : "e.g. Demonstration School"}
              className="text-xs h-10"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-[11px] text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="school-region" required className="text-xs font-medium">
              {locale === "th" ? "ภูมิภาค" : "Region"}
            </Label>
            <Select

              onValueChange={(val) => setValue("region", val)}
            >
              <SelectTrigger id="school-region" className="text-xs h-10 w-full">
                <SelectValue placeholder="เลือกภูมิภาค" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((reg) => (
                  <SelectItem key={reg} value={reg} className="text-xs">
                    {reg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.region && (
              <p className="text-[11px] text-destructive">{errors.region.message}</p>
            )}
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
