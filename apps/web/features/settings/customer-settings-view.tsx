"use client";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Empty, EmptyHeader, EmptyDescription } from "../../components/ui/empty";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { useAuth } from "../../stores/auth-store";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { loadOrganizationRows } from "../organization/organization-document-loader";
import type { OrganizationDocument } from "../organization/organization-document-model";
import { CustomerProfileModal } from "./customer-profile-modal";
import { Building2, User as UserIcon, Bell, Info, Pencil, CheckCircle2 } from "lucide-react";

interface LegalContract extends OrganizationDocument {
  companyName?: string;
  customerName?: string;
  taxId?: string;
  taxAddress?: string;
  taxBranch?: string;
}

interface Notifications {
  criticalEmailAlert: boolean;
  inAppNotification: boolean;
  emailAddress?: string;
}

export function CustomerSettingsView() {
  const locale = useLocale();
  const { user } = useAuth();
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const [legal, setLegal] = useState<LegalContract[] | null>(null);
  const [notifications, setNotifications] = useState<Notifications | null>({
    criticalEmailAlert: true,
    inAppNotification: true,
  });
  const [loadError, setLoadError] = useState("");
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      loadOrganizationRows<LegalContract>("contracts", apiClient.get),
      apiClient.get<Notifications>("/v1/notifications/settings"),
    ])
      .then(([rows, prefs]) => {
        if (active) {
          setLegal(rows);
          setNotifications(prefs);
        }
      })
      .catch(() => {
        if (active) setLoadError("load");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleToggleNotification(key: "criticalEmailAlert" | "inAppNotification", checked: boolean) {
    if (!notifications) return;
    const prev = { ...notifications };
    const updated = {
      ...notifications,
      [key]: checked,
      emailAddress: user?.email || notifications.emailAddress || "",
    };
    setNotifications(updated);
    setNotifBusy(true);
    setNotifSaved(false);
    setNotifError("");
    try {
      await apiClient.put("/v1/notifications/settings", updated);
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2500);
    } catch {
      setNotifications(prev);
      setNotifError(text("บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "Failed to update notification settings"));
    } finally {
      setNotifBusy(false);
    }
  }

  const initials = user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : "CU";

  return (
    <div className="w-full space-y-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {text("ข้อมูลองค์กรและบัญชี", "Organization & Account")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {text(
            "รายละเอียดนิติบุคคลตามสัญญา ข้อมูลบัญชีผู้ใช้งาน และช่องทางรับเอกสารการแจ้งเตือน",
            "Contract legal entity details, user account information, and document delivery preferences.",
          )}
        </p>
      </header>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>
            {text(
              "โหลดข้อมูลองค์กรหรือการแจ้งเตือนไม่สำเร็จ กรุณาโหลดหน้าใหม่อีกครั้ง",
              "Unable to load organization or notification settings. Please reload this page.",
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Legal Organization & Tax Information Card (Big card without inner nested card) */}
      <Card className="rounded-xl border bg-card shadow-xs">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {text("ข้อมูลนิติบุคคลสำหรับเอกสาร", "Legal Organization & Tax Info")}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {text(
                  "ข้อมูลสำหรับการออกใบวางบิลและใบกำกับภาษีตามสัญญา (อ่านอย่างเดียว)",
                  "Contractual information used for invoices and tax documents (Read-only)",
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3.5 text-xs text-muted-foreground flex items-center gap-2.5">
            <Info className="size-4 shrink-0 text-primary" />
            <span>
              {text(
                "ข้อมูลนิติบุคคลเป็นข้อมูลตามสัญญาทางกฎหมาย หากต้องการแก้ไขข้อมูลสำหรับการออกเอกสาร กรุณาติดต่อเจ้าหน้าที่ดูแลระบบ",
                "Organization details are established by contract. To update legal or billing details, please contact system administration.",
              )}
            </span>
          </div>

          {legal === null ? (
            <p className="text-xs text-muted-foreground py-2">{text("กำลังโหลดข้อมูล…", "Loading…")}</p>
          ) : legal.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>
                  {text("ยังไม่มีข้อมูลลูกค้าสำหรับเอกสาร", "No customer document records available")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            legal.map((row) => (
              <dl
                key={row.id}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-1"
              >
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{text("ชื่อองค์กร / บริษัท", "Organization Name")}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                    {row.companyName || row.customerName || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{text("ไซต์งานที่ติดตั้ง", "Assigned Site")}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                    {row.siteName || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{text("เลขประจำตัวผู้เสียภาษี", "Tax ID")}</dt>
                  <dd className="mt-1 break-words text-sm font-mono font-medium text-foreground">
                    {row.taxId || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{text("สาขาภาษี", "Tax Branch")}</dt>
                  <dd className="mt-1 break-words text-sm text-foreground">
                    {row.taxBranch || text("สำนักงานใหญ่", "Head Office")}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-muted-foreground">{text("ที่อยู่จดทะเบียนตามสัญญา", "Registered Legal Address")}</dt>
                  <dd className="mt-1 break-words text-sm text-foreground">
                    {row.taxAddress || "—"}
                  </dd>
                </div>
              </dl>
            ))
          )}
        </CardContent>
      </Card>

      {/* 2. My Account Profile Card (Big card without inner nested card) */}
      <Card className="rounded-xl border bg-card shadow-xs">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <UserIcon className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  {text("บัญชีผู้ใช้งานของฉัน", "My Account Profile")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {text("ข้อมูลบัญชีผู้ใช้งานและสถานะการเข้าสู่ระบบ", "Current user account identity and role")}
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditProfileOpen(true)}
              className="gap-1.5 text-xs h-9 px-3.5"
            >
              <Pencil className="size-3.5" />
              <span>{text("แก้ไขโปรไฟล์", "Edit Profile")}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              className="relative group cursor-pointer rounded-full"
              aria-label={text("เปลี่ยนรูปโปรไฟล์", "Change profile image")}
            >
              <Avatar className="size-16 border-2 border-background shadow-xs shrink-0">
                {user?.avatarData && <AvatarImage src={user.avatarData} alt={user.displayName || ""} />}
                <AvatarFallback className="bg-primary text-primary-foreground font-bold text-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            <dl className="grid gap-4 flex-1 w-full sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{text("ชื่อผู้ใช้งาน", "Full Name")}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                  {user?.displayName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{text("อีเมลเข้าสู่ระบบ", "Login Email")}</dt>
                <dd className="mt-1 break-words text-sm font-mono text-foreground">
                  {user?.email || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{text("บทบาทในระบบ", "System Role")}</dt>
                <dd className="mt-1">
                  <Badge variant="outline" className="font-medium bg-primary/10 text-primary border-primary/20">
                    {text("ผู้ใช้งานองค์กรลูกค้า", "Customer Organization User")}
                  </Badge>
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* 3. Notifications & Document Delivery Card (Big card without inner nested boxes) */}
      <Card className="rounded-xl border bg-card shadow-xs">
        <CardHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Bell className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  {text("การรับเอกสารและการแจ้งเตือน", "Notifications & Document Delivery")}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {text(
                    "กำหนดช่องทางรับอีเมลแจ้งเตือนรอบบิลและเหตุสำคัญ (ส่งไปยังอีเมลผู้ใช้ปัจจุบันโดยอัตโนมัติ)",
                    "Configure notification channels for billing and critical updates (sent to current account email).",
                  )}
                </CardDescription>
              </div>
            </div>
            {notifSaved && (
              <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 transition-opacity">
                <CheckCircle2 className="size-3.5" />
                <span>{text("บันทึกแล้ว", "Saved")}</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-1">
          {notifError && (
            <p role="alert" className="text-xs text-destructive mb-3">
              {notifError}
            </p>
          )}

          {notifications && (
            <div className="divide-y divide-border/60">
              <div className="flex items-center justify-between py-3.5 first:pt-1">
                <div className="space-y-0.5 pr-4">
                  <Label htmlFor="critical-email-alert" className="text-sm font-medium text-foreground cursor-pointer">
                    {text("รับอีเมลแจ้งเตือนรอบบิลและเหตุสำคัญ", "Receive email alerts for invoices and critical updates")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {text(
                      `ส่งแจ้งเตือนรอบบิลและเหตุสำคัญไปยัง ${user?.email || "อีเมลของคุณ"}`,
                      `Send billing and critical notifications directly to ${user?.email || "your email"}`,
                    )}
                  </p>
                </div>
                <Switch
                  id="critical-email-alert"
                  checked={notifications.criticalEmailAlert}
                  disabled={notifBusy}
                  onCheckedChange={(checked) => void handleToggleNotification("criticalEmailAlert", checked)}
                />
              </div>

              <div className="flex items-center justify-between py-3.5 last:pb-1">
                <div className="space-y-0.5 pr-4">
                  <Label htmlFor="in-app-notification" className="text-sm font-medium text-foreground cursor-pointer">
                    {text("การแจ้งเตือนภายในระบบ (In-app notifications)", "In-app notifications")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {text(
                      "แสดงการแจ้งเตือนและข้อความแจ้งเตือนผ่านกระดิ่งแจ้งเตือนบนแถบเครื่องมือ",
                      "Display notifications and status updates via the top notification bell icon.",
                    )}
                  </p>
                </div>
                <Switch
                  id="in-app-notification"
                  checked={notifications.inAppNotification}
                  disabled={notifBusy}
                  onCheckedChange={(checked) => void handleToggleNotification("inAppNotification", checked)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Edit Modal */}
      <CustomerProfileModal
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
      />
    </div>
  );
}
