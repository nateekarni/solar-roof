"use client";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Mail,
  Phone,
  Save,
  School,
  Shield,
  User,
} from "lucide-react";
import { useAuth } from "../../../../stores/auth-store";
import { useLocale, useT } from "../../../../providers/locale-provider";
import { notify } from "../../../../components/feedback/notifications";
import { Avatar, AvatarFallback } from "../../../../components/ui/avatar";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";

export default function AccountSettingsPage() {
  const t = useT();
  const locale = useLocale();
  const { user, setAuth } = useAuth();

  const [displayName, setDisplayName] = React.useState(user?.displayName || "");
  const [email] = React.useState(user?.email || "admin@solar.local");
  const [phone, setPhone] = React.useState("081-234-5678");
  const [department, setDepartment] = React.useState(
    user?.role === "school_user" ? "ฝ่ายบริหารงานทั่วไป" : "ฝ่ายปฏิบัติการและวิศวกรรม"
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const initials = (displayName || user?.displayName || "SU")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (user) {
        setAuth({
          ...user,
          displayName: displayName.trim() || user.displayName,
        });
      }
      notify.success(
        locale === "th"
          ? "บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว"
          : "Profile updated successfully"
      );
    } catch {
      notify.error(
        locale === "th"
          ? "ไม่สามารถบันทึกข้อมูลได้"
          : "Failed to update profile"
      );
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeLabel = () => {
    switch (user?.role) {
      case "owner":
        return locale === "th" ? "เจ้าของระบบ (Platform Owner)" : "Platform Owner";
      case "admin":
        return locale === "th" ? "ผู้ดูแลระบบ (Platform Admin)" : "Platform Admin";
      case "school_user":
        return locale === "th" ? "ผู้ดูแลโรงเรียน (School Admin)" : "School Admin";
      default:
        return locale === "th" ? "ผู้ใช้งานทั่วไป (User)" : "User";
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
            <User className="size-6 text-primary" />
            <span>{locale === "th" ? "การตั้งค่าบัญชี" : "Account Settings"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th"
              ? "จัดการข้อมูลส่วนตัว รูปโปรไฟล์ และข้อมูลผู้ใช้งานระบบ"
              : "Manage your personal profile, avatar, and contact details"}
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Card 1: Avatar & Identity Card */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลประจำตัว" : "Profile Identity"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "รูปประจำตัวและสถานะสิทธิ์ของผู้ใช้" : "Avatar and account role status"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-4">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <div className="relative group">
                  <Avatar className="size-20 ring-2 ring-primary/30 shadow-md">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    title={locale === "th" ? "เปลี่ยนรูปโปรไฟล์" : "Change avatar"}
                    onClick={() => notify.info(locale === "th" ? "สามารถเปลี่ยนรูปภาพได้ในรุ่นถัดไป" : "Avatar upload available soon")}
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-primary text-primary-foreground shadow-md hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Camera className="size-3.5" />
                  </button>
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-base font-bold text-foreground">
                      {displayName || "User"}
                    </span>
                    <Badge variant="outline" className="w-fit mx-auto sm:mx-0 text-xs bg-primary/10 text-primary border-primary/25 font-semibold">
                      <Shield className="size-3 mr-1" />
                      {getRoleBadgeLabel()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5">
                    <Mail className="size-3.5" />
                    <span>{email}</span>
                  </p>
                  {user?.role === "school_user" && (
                    <p className="text-xs text-foreground font-medium flex items-center justify-center sm:justify-start gap-1.5 pt-1">
                      <School className="size-3.5 text-muted-foreground" />
                      <span>โรงเรียนบ้านคลองแสน (SCH-001)</span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Contact and Personal Information */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลติดต่อและสังกัด" : "Contact & Organization"}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="display-name" className="text-xs font-medium">
                    {locale === "th" ? "ชื่อที่แสดง (Display Name)" : "Display Name"}
                  </Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="account-email" className="text-xs font-medium flex items-center justify-between">
                    <span>{locale === "th" ? "อีเมล (Email)" : "Email"}</span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      {locale === "th" ? "ยืนยันแล้ว" : "Verified"}
                    </span>
                  </Label>
                  <Input
                    id="account-email"
                    value={email}
                    disabled
                    className="h-9 text-xs bg-muted/50 cursor-not-allowed opacity-80"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone-number" className="text-xs font-medium">
                    {locale === "th" ? "เบอร์โทรศัพท์ติดต่อ" : "Phone Number"}
                  </Label>
                  <Input
                    id="phone-number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-xs font-medium">
                    {locale === "th" ? "แผนก / หน่วยงาน" : "Department / Agency"}
                  </Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border/40 flex justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  size="sm"
                  className="h-9 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 gap-1.5 cursor-pointer shadow-xs"
                >
                  <Save className="size-3.5" />
                  <span>
                    {saving
                      ? (locale === "th" ? "กำลังบันทึก..." : "Saving...")
                      : (locale === "th" ? "บันทึกการเปลี่ยนแปลง" : "Save Changes")}
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </main>
  );
}
