"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useLocale, useT } from "../../../../providers/locale-provider";
import { apiClient } from "../../../../lib/api-client";
import { notify } from "../../../../components/feedback/notifications";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import { Badge } from "../../../../components/ui/badge";

export default function SecuritySettingsPage() {
  const t = useT();
  const locale = useLocale();
  const [editingPassword, setEditingPassword] = React.useState(false);

  // Change password states
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError(
        locale === "th"
          ? "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร"
          : "New password must be at least 8 characters long"
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        locale === "th"
          ? "รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน"
          : "Passwords do not match"
      );
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiClient.put("/v1/auth/password", {
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(true);
      notify.success(
        locale === "th" ? "เปลี่ยนรหัสผ่านสำเร็จแล้ว" : "Password changed successfully"
      );
      setTimeout(() => {
        setPasswordSuccess(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 2500);
    } catch (err: any) {
      const msg =
        err?.message ||
        (locale === "th"
          ? "ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาตรวจสอบรหัสผ่านเดิม"
          : "Failed to change password. Please check your current password.");
      setPasswordError(msg);
      notify.error(msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <main className="content">
      <div className="ops-content w-full space-y-5">
        {/* Navigation Back Link (Mobile Only) */}
        <div className="block md:hidden">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="size-4" />
            <span>{locale === "th" ? "การตั้งค่า" : "Settings"}</span>
          </Link>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2.5">
            <span>{locale === "th" ? "ความปลอดภัยและรหัสผ่าน" : "Security & Password"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th"
              ? "เปลี่ยนรหัสผ่าน จัดการการเข้าสู่ระบบ และการยืนยันตัวตนสองชั้น (2FA)"
              : "Manage password, two-factor authentication, and login sessions"}
          </p>
        </div>

        {/* 1. Change Password Card */}
        <Card className="panel">
          <CardHeader className="p-0 pb-3 order/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <span>{locale === "th" ? "เปลี่ยนรหัสผ่าน (Change Password)" : "Change Password"}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {locale === "th"
                ? "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร"
                : "Password must be at least 8 characters"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            {passwordSuccess ? (
              <div className="py-6 flex flex-col items-center text-center space-y-2">
                <CheckCircle2 className="size-10 text-emerald-500 animate-in zoom-in-50 duration-300" />
                <h4 className="text-sm font-bold text-foreground">
                  {locale === "th" ? "เปลี่ยนรหัสผ่านสำเร็จ!" : "Password Updated Successfully!"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {locale === "th"
                    ? "คุณสามารถใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไปได้ทันที"
                    : "You can now use your new password on next login."}
                </p>
              </div>
            ) : !editingPassword ? <div className="space-y-4"><dl><dt className="text-sm text-muted-foreground">{locale === "th" ? "รหัสผ่าน" : "Password"}</dt><dd className="mt-1">••••••••</dd></dl><Button variant="outline" onClick={() => setEditingPassword(true)}>{locale === "th" ? "เปลี่ยนรหัสผ่าน" : "Change password"}</Button></div> : (
              <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                <div className="space-y-2">
                  <Label htmlFor="current-pw" className="text-xs font-medium">
                    {locale === "th" ? "รหัสผ่านปัจจุบัน" : "Current Password"}
                  </Label>
                  <Input
                    id="current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-10 text-xs"
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-pw" className="text-xs font-medium">
                      {locale === "th" ? "รหัสผ่านใหม่" : "New Password"}
                    </Label>
                    <Input
                      id="new-pw"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-10 text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-pw" className="text-xs font-medium">
                      {locale === "th" ? "ยืนยันรหัสผ่านใหม่" : "Confirm New Password"}
                    </Label>
                    <Input
                      id="confirm-pw"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-10 text-xs"
                      required
                    />
                  </div>
                </div>

                {passwordError && (
                  <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-border/40 flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={isChangingPassword} onClick={() => { setEditingPassword(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }}>{locale === "th" ? "ยกเลิก" : "Cancel"}</Button>
                  <Button
                    type="submit"
                    disabled={isChangingPassword}
                    size="sm"
                    className="h-10 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Lock className="size-3.5" />
                    <span>
                      {isChangingPassword
                        ? (locale === "th" ? "กำลังบันทึก..." : "Saving...")
                        : (locale === "th" ? "บันทึกรหัสผ่านใหม่" : "Update Password")}
                    </span>
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="p-0 pb-2"><CardTitle className="text-sm">{locale === "th" ? "การยืนยันตัวตนสองขั้นตอนและอุปกรณ์ที่เข้าสู่ระบบ" : "Two-factor authentication and login devices"}</CardTitle></CardHeader>
          <CardContent className="p-0 text-xs text-muted-foreground">{locale === "th" ? "ระบบยังไม่รองรับการตั้งค่า 2FA หรือการดูและยกเลิกเซสชันอุปกรณ์จากหน้านี้" : "Two-factor setup and device session viewing or revocation are not available on this page."}</CardContent>
        </Card></div>
    </main>
  );
}
