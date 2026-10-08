"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { organizationFormSchema } from "./organization-form-schema";
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

type SchoolFormValues = z.infer<ReturnType<typeof organizationFormSchema>>;

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
    resolver: zodResolver(organizationFormSchema(locale)),
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
          ? `เพิ่มองค์กร "${values.name}" เรียบร้อยแล้ว`
          : `Organization "${values.name}" added successfully`
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
            {locale === "th" ? "เพิ่มองค์กรใหม่" : "Add New Organization"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locale === "th"
              ? "กรอกข้อมูลองค์กรเพื่อลงทะเบียนเข้าสู่ระบบแพลตฟอร์ม"
              : "Enter organization information to register on the platform"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3.5">
          <div className="space-y-2">
            <Label htmlFor="school-name" required className="text-xs font-medium">
              {locale === "th" ? "ชื่อองค์กร" : "Organization Name"}
            </Label>
            <Input
              id="school-name"
              placeholder={locale === "th" ? "เช่น บริษัทตัวอย่าง" : "e.g. Example Company"}
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
                <SelectValue placeholder={locale === "th" ? "เลือกภูมิภาค" : "Select a region"} />
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
