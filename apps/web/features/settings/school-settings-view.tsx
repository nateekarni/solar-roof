"use client";

import * as React from "react";
import {
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Moon,
  Palette,
  RotateCcw,
  School,
  Shield,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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
import { useLocale, useSetLocale } from "../../providers/locale-provider";
import { useAuth } from "../../stores/auth-store";

interface ContractInfo {
  id: string;
  contractNumber: string;
  startDate: string;
  rate: number;
  signers: string;
  status: string;
  schoolName?: string;
}

export function SchoolSettingsView() {
  const router = useRouter();
  const { user, clear, updatePreferences } = useAuth();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [editingPreferences,setEditingPreferences] = React.useState(false);
  const [mounted,setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true),[]);

  const [contract, setContract] = React.useState<ContractInfo | null>(null);
  const [loadingContract, setLoadingContract] = React.useState(true);

  // Change password dialog state
  const [passwordDialogOpen, setPasswordDialogOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState(false);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);

  // Logout confirmation state
  const [logoutDialogOpen, setLogoutDialogOpen] = React.useState(false);

  // Fetch school PPA contract
  React.useEffect(() => {
    apiClient
      .get<{ rows: ContractInfo[] }>("/v1/operations/contracts")
      .then((res) => {
        if (res?.rows && res.rows.length > 0 && res.rows[0]) {
          setContract(res.rows[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingContract(false));
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiClient.put("/v1/auth/password", {
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(true);
      setTimeout(() => {
        setPasswordDialogOpen(false);
        setPasswordSuccess(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 1500);
    } catch (err: any) {
      setPasswordError(err?.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาตรวจสอบรหัสผ่านปัจจุบัน");
    } finally {
      setIsChangingPassword(false);
    }
  };

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

  return (
    <div className="space-y-4 w-full pb-10">
      {/* 1. Profile Card */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardHeader className="pb-3 order/40">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            ข้อมูลผู้ใช้งานและโรงเรียน
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col sm:flex-row items-center sm:items-start gap-4">
          <Avatar className="size-16 ring-2 ring-primary/20 shadow-xs">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <h3 className="text-base font-bold text-foreground">{user?.displayName || "ผู้ดูแลโรงเรียน"}</h3>
              <Badge variant="outline" className="w-fit mx-auto sm:mx-0 text-[10px] bg-primary/10 text-primary border-primary/20">
                {locale === "th" ? "เจ้าหน้าที่โรงเรียน" : "School Officer"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{user?.email || "—"}</p>
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-foreground font-medium pt-1">
              <School className="size-3.5 text-muted-foreground" />
              <span>{contract?.schoolName || "ยังไม่มีข้อมูลโรงเรียน"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Contract Information Card */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardHeader className="pb-3 order/40">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            ข้อมูลสัญญาซื้อขายไฟฟ้า (PPA Agreement)
          </CardTitle>
          <CardDescription className="text-xs">
            รายละเอียดสัญญาและอัตราค่าไฟฟ้าที่ตกลงไว้กับโครงการ
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground block">เลขที่สัญญา</span>
              <span className="font-bold text-foreground">{contract?.contractNumber || "—"}</span>
            </div>
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground block">อัตราค่าไฟฟ้า PPA</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {contract?.rate ?? "—"} บาท/kWh
              </span>
            </div>
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground block">วันเริ่มต้นสัญญา</span>
              <span className="font-medium text-foreground">{contract?.startDate || "—"}</span>
            </div>
            <div className="space-y-2">
              <span className="text-[11px] text-muted-foreground block">สถานะสัญญา</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {contract?.status || "ยังไม่มีสัญญา"}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground pt-1 flex items-center justify-between">
            <span>คู่สัญญา: {contract?.signers || "—"}</span>
            {contract && <Button variant="link" size="sm" onClick={() => router.push(`/records/contracts/${contract.id}`)}>ดูรายละเอียดสัญญา</Button>}
          </div>
        </CardContent>
      </Card>

      {/* 3. Preferences Card */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardHeader className="pb-3 order/40">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            การตั้งค่าทั่วไป (Preferences)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {!editingPreferences ? <div className="space-y-4"><dl className="space-y-4"><div><dt className="text-sm text-muted-foreground">ภาษา</dt><dd>{locale === 'th' ? 'ภาษาไทย' : 'English'}</dd></div><div><dt className="text-sm text-muted-foreground">ธีม</dt><dd>{mounted ? theme === 'dark' ? 'มืด' : theme === 'light' ? 'สว่าง' : 'ตามระบบ' : '—'}</dd></div></dl><Button variant="outline" onClick={() => setEditingPreferences(true)}>แก้ไขการแสดงผล</Button></div> : <>
          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Globe className="size-3.5 text-muted-foreground" />
                ภาษา (Language)
              </Label>
              <p className="text-[11px] text-muted-foreground">เลือกภาษาที่แสดงในระบบ</p>
            </div>
            <Select value={locale} onValueChange={(val) => setLocale(val as "th" | "en")}>
              <SelectTrigger className="w-32 h-10 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="th">ไทย (TH)</SelectItem>
                <SelectItem value="en">English (EN)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Sun className="size-3.5 text-muted-foreground" />
                ธีมการแสดงผล (Theme)
              </Label>
              <p className="text-[11px] text-muted-foreground">โหมดสว่าง, โหมดมืด หรือตามระบบ</p>
            </div>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted border border-border/60">
              <Button
                variant={theme === "light" ? "secondary" : "ghost"}
                size="icon"
                className="size-10 rounded-md"
                onClick={() => setTheme("light")}
              >
                <Sun className="size-3.5" />
              </Button>
              <Button
                variant={theme === "dark" ? "secondary" : "ghost"}
                size="icon"
                className="size-10 rounded-md"
                onClick={() => setTheme("dark")}
              >
                <Moon className="size-3.5" />
              </Button>
              <Button
                variant={theme === "system" ? "secondary" : "ghost"}
                size="icon"
                className="size-10 rounded-md"
                onClick={() => setTheme("system")}
              >
                <Laptop className="size-3.5" />
              </Button>
            </div>
          </div><Button variant="outline" onClick={() => setEditingPreferences(false)}>เสร็จสิ้น</Button></>}

        </CardContent>
      </Card>

      {/* 4. Security & Password Card */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardHeader className="pb-3 order/40">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            ความปลอดภัย (Security)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-muted-foreground" />
              รหัสผ่านบัญชีผู้ใช้
            </Label>
            <p className="text-[11px] text-muted-foreground">เปลี่ยนรหัสผ่านเพื่อความปลอดภัยของระบบ</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs font-medium"
            onClick={() => setPasswordDialogOpen(true)}
          >
            เปลี่ยนรหัสผ่าน
          </Button>
        </CardContent>
      </Card>

      {/* 5. Logout Section */}
      <div className="pt-2">
        <Button
          variant="outline"
          className="w-full h-10 text-xs font-medium text-destructive border-destructive/30 hover:bg-destructive/10 gap-2"
          onClick={() => setLogoutDialogOpen(true)}
        >
          <LogOut className="size-4" />
          ออกจากระบบ (Sign Out)
        </Button>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 sm:p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">เปลี่ยนรหัสผ่าน</DialogTitle>
            <DialogDescription className="text-xs">
              กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 8 ตัวอักษร
            </DialogDescription>
          </DialogHeader>

          {passwordSuccess ? (
            <div className="py-6 flex flex-col items-center text-center space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <h4 className="text-sm font-bold text-foreground">เปลี่ยนรหัสผ่านสำเร็จ!</h4>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label className="text-xs">รหัสผ่านปัจจุบัน</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-10 text-xs"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">รหัสผ่านใหม่</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-10 text-xs"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">ยืนยันรหัสผ่านใหม่</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-10 text-xs"
                  required
                />
              </div>

              {passwordError && (
                <p className="text-xs text-destructive font-medium">{passwordError}</p>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPasswordDialogOpen(false)}
                  disabled={isChangingPassword}
                  className="h-10 text-xs"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isChangingPassword}
                  className="h-10 text-xs"
                >
                  บันทึกรหัสผ่านใหม่
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Logout Dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="sm:max-w-xs p-5 rounded-2xl text-center space-y-3">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <LogOut className="size-6" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold">ออกจากระบบ?</DialogTitle>
            <DialogDescription className="text-xs mt-1">
              คุณต้องการออกจากระบบ Solar Platform ใช่หรือไม่
            </DialogDescription>
          </div>
          <DialogFooter className="flex-row justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogoutDialogOpen(false)}
              className="flex-1 h-10 text-xs"
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              className="flex-1 h-10 text-xs"
            >
              ออกจากระบบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
