"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Mail,
  School,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  Clock,
  KeyRound,
} from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { notify } from "../../../components/feedback/notifications";
import { useLocale } from "../../../providers/locale-provider";

export interface UserItemData {
  id?: string;
  displayName?: string;
  email?: string;
  role?: string;
  schoolName?: string;
  lastActive?: string;
  createdAt?: string;
  status?: string;
  [key: string]: any;
}

export function UserDetailModal({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserItemData | null;
}) {
  const locale = useLocale();
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!user) return null;

  const copyToClipboard = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      notify.error(locale === "th" ? "คัดลอกไม่สำเร็จ" : "Could not copy to clipboard"); return;
    }
    setCopiedKey(key);
    notify.success(locale === "th" ? "คัดลอกลงคลิปบอร์ดแล้ว" : "Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const role = user.role?.toLowerCase() || "";
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isSchoolUser = role === "school_user";

  const getRoleLabel = () => {
    if (!role) return locale === "th" ? "ไม่มีข้อมูลบทบาท" : "Role unavailable";
    if (isOwner) return locale === "th" ? "เจ้าของระบบ (Owner)" : "System Owner";
    if (isAdmin) return locale === "th" ? "ผู้ดูแลระบบ (Admin)" : "Administrator";
    if (isSchoolUser) return locale === "th" ? "ผู้ดูแลโรงเรียน (School Staff)" : "School User";
    return role;
  };

  const getRoleDescription = () => {
    if (!role) return locale === "th" ? "ไม่มีข้อมูลสิทธิ์" : "Permission information unavailable";
    if (isOwner) {
      return locale === "th"
        ? "มีสิทธิ์สูงสุดในการจัดการผู้ใช้ สัญญา อัตราค่าไฟฟ้า และการตั้งค่าความปลอดภัยทั้งระบบ"
        : "Full administrative access including billing, rate versions, contracts, and system audits.";
    }
    if (isAdmin) {
      return locale === "th"
        ? "จัดการข้อมูลและอุปกรณ์ภายในขอบเขตที่บัญชีได้รับอนุญาต"
        : "Manage records and equipment within the scope assigned to this account.";
    }
    return locale === "th"
      ? `เข้าถึงและจัดการข้อมูลเฉพาะ ${user.schoolName || "โรงเรียนต้นสังกัด"} ดูยอดบิล และอัปโหลดสลิป`
      : `Access restricted to ${user.schoolName || "assigned school"} dashboards and payment submissions.`;
  };

  const isActive = user.status === "active" || user.status === "ใช้งานปกติ";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:fixed max-sm:inset-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:rounded-none max-sm:p-4 max-sm:flex max-sm:flex-col sm:max-w-xl sm:rounded-2xl sm:p-6 sm:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="shrink-0 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div
              className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${
                isOwner
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : isAdmin
                  ? "bg-primary/15 text-primary"
                  : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
              }`}
            >
              {isOwner ? (
                <ShieldAlert className="size-6" />
              ) : isAdmin ? (
                <ShieldCheck className="size-6" />
              ) : (
                <User className="size-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-bold truncate">
                  {user.displayName || user.email || "รายละเอียดผู้ใช้งาน"}
                </DialogTitle>
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="text-xs shrink-0"
                >
                  {user.status || (locale === "th" ? "ไม่มีข้อมูลสถานะ" : "Status unavailable")}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {user.email}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-sm my-2">
          {/* Role & Permissions Card */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-card/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Shield className="size-4 text-primary" />
                <span>{locale === "th" ? "สิทธิ์และบทบาท" : "Role & Permissions"}</span>
              </div>
              <Badge variant="outline" className="text-xs font-semibold">
                {getRoleLabel()}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {getRoleDescription()}
            </p>
          </div>

          {/* User Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="size-3.5" />
                <span>{locale === "th" ? "อีเมลติดต่อ" : "Email Address"}</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium text-xs truncate select-all">{user.email || "-"}</span>
                {user.email && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => copyToClipboard(user.email!, "email")}
                    title={locale === "th" ? "คัดลอกอีเมล" : "Copy Email"}
                  >
                    {copiedKey === "email" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  </Button>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <School className="size-3.5" />
                <span>{locale === "th" ? "สังกัดโรงเรียน" : "School Assignment"}</span>
              </div>
              <div className="font-medium text-xs text-foreground truncate">
                {user.schoolName || "—"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="size-3.5" />
                <span>{locale === "th" ? "เข้าใช้งานล่าสุด" : "Last Active"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {user.lastActive || "-"}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                <span>{locale === "th" ? "วันที่สร้างบัญชี" : "Created At"}</span>
              </div>
              <div className="font-medium text-xs text-foreground">
                {user.createdAt || "-"}
              </div>
            </div>
          </div>

          {/* User ID Meta */}
          {user.id && (
            <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-mono">ID: {user.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => copyToClipboard(user.id!, "userId")}
              >
                {copiedKey === "userId" ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



