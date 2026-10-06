"use client";
import { canVisitPage } from "@solar/domain";
import { useSessionUser } from "../../../providers/session-user-provider";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Gauge,
  History,
  LogOut,
  ShieldCheck,
  Sliders,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "../../../stores/auth-store";
import { useLocale } from "../../../providers/locale-provider";
import { SchoolSettingsView } from "../../../features/settings/school-settings-view";
import { Avatar, AvatarFallback } from "../../../components/ui/avatar";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../../../components/ui/dialog";



export default function SettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const { clear } = useAuth();
  const user = useSessionUser();
  const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    clear();
    router.push("/login");
  };

  const initials = (user?.displayName || "SU")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const getRoleName = () => {
    switch (user?.role) {
      case "owner":
        return locale === "th" ? "เจ้าของบริษัท" : "Company Owner";
      case "admin":
        return locale === "th" ? "ผู้ดูแลระบบสูงสุด" : "Super Administrator";
      case "school_user":
        return locale === "th" ? "เจ้าหน้าที่โรงเรียน" : "School Officer";
      default:
        return locale === "th" ? "ผู้ดูแลระบบ" : "Administrator";
    }
  };

  return (
    <>
      {/* 1. Mobile View: Settings Menu Hub */}
      {user?.role === "school_user" ? <main className="content"><SchoolSettingsView /></main> : <main className="content pb-12">
        <div className="ops-content w-full space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {locale === "th" ? "การตั้งค่า" : "Settings"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {locale === "th"
                ? "เลือกหมวดหมู่ที่ต้องการจัดการและปรับแต่ง"
                : "Select a category to configure"}
            </p>
          </div>

          {/* Quick Profile Summary Banner */}
          <Link
            href="/settings/account"
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-card border border-border/70 shadow-xs hover:bg-muted/40 transition-colors"
          >
            <Avatar className="size-12 ring-2 ring-primary/20 shadow-xs">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-foreground truncate">
                  {user?.displayName || "User"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{user?.email || "—"}</p>
              <Badge variant="outline" className="mt-1 text-[10px] bg-primary/10 text-primary border-primary/20">
                {getRoleName()}
              </Badge>
            </div>
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </Link>

          {/* Group 1: User & Preferences */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase px-1">
              {locale === "th" ? "บัญชีและความชอบส่วนตัว" : "Account & Preferences"}
            </span>

            <div className="rounded-2xl bg-card border border-border/70 divide-y divide-border/50 shadow-xs overflow-hidden">
              {/* 1. General Settings */}
              <Link
                href="/settings/company"
                className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                  <Sliders className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    {locale === "th" ? "ข้อมูลบริษัทและบัญชีธนาคาร" : "Company and Bank Accounts"}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {locale === "th"
                      ? "ข้อมูลบริษัทและบัญชีธนาคารรับเงิน"
                      : "Company profile and payment bank accounts"}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>

              <Link href="/settings/general" className="flex items-center gap-3 p-3.5 min-h-11 hover:bg-muted/50"><Sliders className="size-5" /><span className="text-sm">{locale === "th" ? "การแสดงผล" : "Preferences"}</span><ChevronRight className="ml-auto size-4" /></Link>
              {/* 2. Account Settings */}
              <Link
                href="/settings/account"
                className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <User className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    {locale === "th" ? "การตั้งค่าบัญชี" : "Account Settings"}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {locale === "th"
                      ? "ชื่อ อีเมล และบทบาทผู้ใช้งาน"
                      : "Name, email, and account role"}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>

              {/* 3. Security Settings */}
              <Link
                href="/settings/security"
                className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <ShieldCheck className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground">
                    {locale === "th" ? "ความปลอดภัย" : "Security & Password"}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {locale === "th"
                      ? "รหัสผ่าน, เซสชันการเข้าใช้งาน"
                      : "Password, sessions, security"}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </Link>
            </div>
          </div>

          {/* Group 2: System & Platform (Only for Non-School Users) */}
          {canVisitPage(user.role, "/settings/system") && (
            <div className="space-y-1.5 pt-2">
              <span className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase px-1">
                {locale === "th" ? "ระบบและแพลตฟอร์ม" : "System & Platform"}
              </span>

              <div className="rounded-2xl bg-card border border-border/70 divide-y divide-border/50 shadow-xs overflow-hidden">
                {/* System Defaults */}
                <Link
                  href="/settings/system"
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <FileText className="size-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {locale === "th" ? "ค่าตั้งต้นระบบและรอบบิล" : "System Defaults"}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {locale === "th"
                        ? "ราคาต่อหน่วย, อัตราดึงข้อมูล, คำนำหน้าบิล"
                        : "Unit price, fetch interval, document prefix"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>

                {/* Meter Presets */}
                <Link
                  href="/settings/meter-presets"
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                    <Gauge className="size-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {locale === "th" ? "ค่าจากมิเตอร์" : "Meter Presets"}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {locale === "th"
                        ? "จัดการรูปแบบข้อมูลและการจับคู่รีจิสเตอร์"
                        : "Modbus registers, scaling, and presets"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>

                {/* Audit Log */}
                <Link
                  href="/settings/audit"
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
                    <History className="size-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {locale === "th" ? "ประวัติการทำงาน" : "Audit Trail"}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {locale === "th"
                        ? "บันทึกเหตุการณ์และประวัติการเปลี่ยนแปลงข้อมูล"
                        : "Append-only system activity and change logs"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>

                {/* User Management */}
                <Link
                  href="/settings/users"
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Users className="size-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-foreground">
                      {locale === "th" ? "จัดการผู้ใช้งาน" : "User Management"}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {locale === "th"
                        ? "จัดการสิทธิ์ เพิ่ม/ลดผู้ดูแลระบบและโรงเรียน"
                        : "Manage users, invitations, and permissions"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </Link>
              </div>
            </div>
          )}

          {/* Logout Section */}
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => setLogoutDialogOpen(true)}
              className="w-full h-10 text-xs font-medium text-destructive border-destructive/30 hover:bg-destructive/10 gap-2 rounded-xl cursor-pointer"
            >
              <LogOut className="size-4" />
              <span>{locale === "th" ? "ออกจากระบบ" : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      </main>}

      {/* Mobile Logout Dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="sm:max-w-xs p-5 rounded-2xl text-center space-y-3">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <LogOut className="size-6" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold">
              {locale === "th" ? "ออกจากระบบ?" : "Sign Out?"}
            </DialogTitle>
            <DialogDescription className="text-xs mt-1">
              {locale === "th"
                ? "คุณต้องการออกจากระบบ Solar Platform ใช่หรือไม่"
                : "Are you sure you want to sign out?"}
            </DialogDescription>
          </div>
          <DialogFooter className="flex-row justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogoutDialogOpen(false)}
              className="flex-1 h-10 text-xs"
            >
              {locale === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="flex-1 h-10 text-xs"
            >
              {locale === "th" ? "ออกจากระบบ" : "Sign Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
