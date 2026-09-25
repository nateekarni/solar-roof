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

  // Change password states
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(false);

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

  const handleToggle2FA = (checked: boolean) => {
    setTwoFactorEnabled(checked);
    if (checked) {
      notify.success(
        locale === "th"
          ? "เปิดใช้งานการยืนยันตัวตน 2FA เรียบร้อยแล้ว (จำลอง)"
          : "Two-factor authentication enabled (Mockup)"
      );
    } else {
      notify.info(
        locale === "th"
          ? "ปิดการยืนยันตัวตน 2FA แล้ว"
          : "Two-factor authentication disabled"
      );
    }
  };

  return (
    <main className="content">
      <div className="ops-content max-w-3xl space-y-5">
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
            <ShieldCheck className="size-6 text-primary" />
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
          <CardHeader className="p-0 pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
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
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="current-pw" className="text-xs font-medium">
                    {locale === "th" ? "รหัสผ่านปัจจุบัน" : "Current Password"}
                  </Label>
                  <Input
                    id="current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-pw" className="text-xs font-medium">
                      {locale === "th" ? "รหัสผ่านใหม่" : "New Password"}
                    </Label>
                    <Input
                      id="new-pw"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-9 text-xs"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-pw" className="text-xs font-medium">
                      {locale === "th" ? "ยืนยันรหัสผ่านใหม่" : "Confirm New Password"}
                    </Label>
                    <Input
                      id="confirm-pw"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-9 text-xs"
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

                <div className="pt-3 border-t border-border/40 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isChangingPassword}
                    size="sm"
                    className="h-9 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 gap-1.5 cursor-pointer shadow-xs"
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

        {/* 2. Two-Factor Authentication (2FA) */}
        <Card className="panel">
          <CardHeader className="p-0 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <span>{locale === "th" ? "การยืนยันตัวตน 2 ขั้นตอน (2FA)" : "Two-Factor Authentication (2FA)"}</span>
              </CardTitle>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  twoFactorEnabled
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border/60"
                }`}
              >
                {twoFactorEnabled
                  ? (locale === "th" ? "เปิดใช้งานแล้ว" : "Active")
                  : (locale === "th" ? "ปิดใช้งาน" : "Disabled")}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {locale === "th"
                ? "เพิ่มความปลอดภัยให้บัญชีของคุณด้วยรหัสผ่านแบบใช้ครั้งเดียวจาก Authenticator App"
                : "Add an extra layer of security using Google Authenticator or Microsoft Authenticator"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pt-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="2fa-toggle" className="text-xs font-medium cursor-pointer">
                  {locale === "th" ? "เปิดใช้งาน 2-Factor Authentication" : "Enable 2FA"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {locale === "th"
                    ? "ต้องกรอกรหัส 6 หลักทุกครั้งที่มีการเข้าสู่ระบบจากอุปกรณ์ใหม่"
                    : "Require 6-digit TOTP code on new device sign-ins"}
                </p>
              </div>
              <Switch
                id="2fa-toggle"
                checked={twoFactorEnabled}
                onCheckedChange={handleToggle2FA}
              />
            </div>
          </CardContent>
        </Card>

        {/* 3. Active Sessions */}
        <Card className="panel">
          <CardHeader className="p-0 pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Laptop className="size-4 text-primary" />
              <span>{locale === "th" ? "อุปกรณ์ที่เข้าสู่ระบบอยู่ในปัจจุบัน" : "Active Login Sessions"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pt-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/40 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Laptop className="size-4" />
                </div>
                <div>
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <span>Windows PC · Google Chrome</span>
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                      {locale === "th" ? "อุปกรณ์ปัจจุบัน" : "This device"}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Bangkok, Thailand · ใช้งานอยู่ขณะนี้</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-muted/20 border border-border/30">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
                  <Smartphone className="size-4" />
                </div>
                <div>
                  <div className="font-medium text-foreground">
                    <span>iPhone 15 · Safari Mobile</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Bangkok, Thailand · 2 ชั่วโมงที่แล้ว</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5 cursor-pointer"
                onClick={() => notify.success(locale === "th" ? "ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว" : "Signed out of all other sessions")}
              >
                <LogOut className="size-3.5" />
                <span>{locale === "th" ? "ออกจากระบบอุปกรณ์อื่นทั้งหมด" : "Sign out other sessions"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
