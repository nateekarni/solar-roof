"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
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

const userSchema = z.object({
  email: z.string().min(1, "กรุณาระบุอีเมล").email("รูปแบบอีเมลไม่ถูกต้อง"),
  displayName: z.string().min(2, "ชื่อผู้ใช้งานต้องมีอย่างน้อย 2 ตัวอักษร"),
  role: z.enum(["owner", "admin", "school_user"]),
  schoolId: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface SchoolOption {
  id: string;
  name: string;
}

export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const lookupSequence = React.useRef(0);
  const [checkingInvitation, setCheckingInvitation] = React.useState(false);
  const [lookupMessage, setLookupMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);
  const [selectedRole, setSelectedRole] = React.useState<"owner" | "admin" | "school_user">("school_user");
  const [invitedResult, setInvitedResult] = React.useState<{
    email: string;
    invitationId: string;
    status: "pending_delivery" | "sent" | "delivery_failed";
    message: string;
  } | null>(null);


  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: "",
      displayName: "",

    },
  });

  React.useEffect(() => {
    lookupSequence.current++; setCheckingInvitation(false); setLookupMessage("");
    if (open) {
      setInvitedResult(null);

      apiClient
        .get<SchoolOption[]>("/v1/schools")
        .then((data) => {
          setSchools(data);
        })
        .catch(() => {});
    }
  }, [open, setValue]);

  const deliveryMessage = (status: "pending_delivery" | "sent" | "delivery_failed") => {
    if(status==='sent')return locale==='th'?'ส่งอีเมลคำเชิญแล้ว ผู้รับต้องเปิดลิงก์ภายใน 24 ชั่วโมง':'Invitation email sent. The recipient must activate within 24 hours.';
    if(status==='delivery_failed')return locale==='th'?'ส่งอีเมลไม่สำเร็จ กรุณาส่งคำเชิญอีกครั้ง':'Email delivery failed. Resend the invitation.';
    return locale==='th'?'บันทึกคำเชิญแล้ว อีเมลยังไม่ได้ส่ง':'Invitation saved. Email has not been sent.';
  };

  const checkExistingInvitation = async () => {
    const email=getValues("email").trim();
    const sequence=++lookupSequence.current;
    if (!userSchema.shape.email.safeParse(email).success) {setCheckingInvitation(false);setLookupMessage("");return;}
    setCheckingInvitation(true);setLookupMessage("");
    try {
      const result=await apiClient.get<{invitationId:string;status:"pending_delivery"|"sent"|"delivery_failed"}>(`/v1/users/invitations?email=${encodeURIComponent(email)}`);
      if (sequence!==lookupSequence.current) return;
      setInvitedResult({...result,email,message:deliveryMessage(result.status)});
    } catch (error) {
      if (sequence!==lookupSequence.current) return;
      setLookupMessage(error instanceof Error && "status" in error && error.status===404 ? (locale==="th"?"ไม่พบคำเชิญเดิม สามารถสร้างคำเชิญใหม่ได้":"No existing invitation. You can create a new invitation.") : (locale==="th"?"ตรวจคำเชิญเดิมไม่สำเร็จ กรุณาออกจากช่องอีเมลเพื่อลองอีกครั้ง":"Unable to check invitations. Leave the email field to retry."));
    } finally {if(sequence===lookupSequence.current)setCheckingInvitation(false);}
  };

  const onSubmit = async (values: UserFormValues) => {
    setLoading(true);
    try {
      const res = await apiClient.post<any>("/v1/users/invite", values);
      setInvitedResult({
        email: values.email,
        invitationId: res.invitationId,
        status: res.status,
        message: deliveryMessage(res.status),
      });
      (res.status === "sent" ? notify.success : res.status === "delivery_failed" ? notify.error : notify.info)(deliveryMessage(res.status));
      reset();
      router.refresh();
    } catch (err: any) {
      notify.error(err.message || "เกิดข้อผิดพลาดในการสร้างผู้ใช้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:rounded-2xl sm:p-6">
        <DialogHeader className="pb-1">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "เชิญผู้ใช้งานใหม่" : "Invite New User"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "สร้างบัญชีผู้ใช้งานและกำหนดสิทธิ์การเข้าถึงโรงเรียน"
                  : "Create user account and assign platform permission scope"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {invitedResult ? (
          <div className="space-y-4 py-3">
            <div className="space-y-2.5 border-t pt-4">
              <p role="status" className="text-xs font-semibold">
                {invitedResult.message}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={loading} onClick={async()=>{
                setLoading(true);
                try {
                  const result=await apiClient.post<{status:"pending_delivery"|"sent"|"delivery_failed"}>(`/v1/users/invitations/${invitedResult.invitationId}/resend`,{});
                  setInvitedResult({...invitedResult,status:result.status,message:deliveryMessage(result.status)});
                } catch(error) {notify.error(error instanceof Error?error.message:'Unable to resend');}
                finally {setLoading(false);}
              }}>{loading?(locale==='th'?'กำลังส่ง…':'Sending…'):(locale==='th'?'ส่งคำเชิญอีกครั้ง':'Resend invitation')}</Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs h-10 px-5 font-semibold w-full sm:w-auto"
              >
                เสร็จสิ้น
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3.5">
            <div className="space-y-2">
              <Label htmlFor="u-email" required className="text-xs font-medium">
                {locale === "th" ? "อีเมล (Email)" : "Email Address"}
              </Label>
              <Input
                id="u-email"
                type="email"
                placeholder="officer@school.local"
                className="text-xs h-10"
                {...register("email", {onBlur:()=>void checkExistingInvitation(),onChange:()=>{lookupSequence.current++;setCheckingInvitation(false);setLookupMessage("");}})}
              />
              <p role="status" className="text-sm text-muted-foreground">{checkingInvitation ? (locale==="th"?"กำลังตรวจคำเชิญเดิม…":"Checking existing invitation…") : lookupMessage}</p>
              {errors.email && (
                <p className="text-[11px] text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">

              <Label htmlFor="u-name" required className="text-xs font-medium">
                {locale === "th" ? "ชื่อ-นามสกุล" : "Display Name"}
              </Label>
              <Input
                id="u-name"
                placeholder={locale === "th" ? "เช่น สมชาย สุขใจ" : "e.g. John Doe"}
                className="text-xs h-10"
                {...register("displayName")}
              />
              {errors.displayName && (
                <p className="text-[11px] text-destructive">{errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="u-role" required className="text-xs font-medium">
                {locale === "th" ? "บทบาท (Role)" : "Role"}
              </Label>
              <Select

                onValueChange={(val: "owner" | "admin" | "school_user") => {
                  setSelectedRole(val);
                  setValue("role", val);
                }}
              >
                <SelectTrigger id="u-role" className="text-xs h-10 w-full">
                  <SelectValue placeholder="เลือกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="school_user" className="text-xs">
                    {t("profile.schoolUser")}
                  </SelectItem>
                  <SelectItem value="admin" className="text-xs">
                    {t("profile.admin")}
                  </SelectItem>
                  <SelectItem value="owner" className="text-xs">
                    {t("profile.owner")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedRole === "school_user" && (
              <div className="space-y-2">
                <Label htmlFor="u-school" required className="text-xs font-medium">
                  {locale === "th" ? "โรงเรียนสังกัด" : "School Access"}
                </Label>
                <Select onValueChange={(val) => setValue("schoolId", val)}>
                  <SelectTrigger id="u-school" className="text-xs h-10 w-full">
                    <SelectValue placeholder="เลือกโรงเรียน" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
              <Button type="submit" size="sm" disabled={loading || checkingInvitation} className="text-xs h-10 px-5 font-semibold">
                {loading ? t("common.saving") : t("common.confirm")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
