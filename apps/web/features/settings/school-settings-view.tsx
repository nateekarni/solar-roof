"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { ChoiceSelect } from "../../components/ui/choice-select";
import { Field, FieldLabel } from "../../components/ui/field";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Empty, EmptyHeader, EmptyDescription } from "../../components/ui/empty";
import { Button } from "../../components/ui/button";
import { useTheme } from "next-themes";
import { useAuth, authStore } from "../../stores/auth-store";
import { useLocale, useSetLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { loadOrganizationRows } from "../organization/organization-document-loader";
import type { OrganizationDocument } from "../organization/organization-document-model";
import {
  submitOwnPasswordChange,
  validateOrganizationPassword,
} from "./organization-settings-model";
interface LegalContract extends OrganizationDocument {
  companyName?: string;
  schoolName?: string;
  taxId?: string;
  taxAddress?: string;
  taxBranch?: string;
}
interface Notifications {
  criticalEmailAlert: boolean;
  inAppNotification: boolean;
  emailAddress: string;
}
export function SchoolSettingsView() {
  const locale = useLocale(),
    setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { user, clear, updatePreferences } = useAuth();
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const [name, setName] = useState(user?.displayName ?? "");
  const [legal, setLegal] = useState<LegalContract[] | null>(null);
  const [notifications, setNotifications] = useState<Notifications | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    setName(user?.displayName ?? "");
  }, [user?.displayName]);
  useEffect(() => {
    let active = true;
    setMounted(true);
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
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await action();
      setSaved(text("บันทึกแล้ว", "Saved"));
    } catch {
      setError(
        text(
          "บันทึกไม่สำเร็จ กรุณาลองใหม่",
          "Could not save. Please try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const inputClass = "min-h-11 w-full max-w-md";
  return (
    <div className="w-full space-y-5 pb-8">
      <h1 className="text-2xl font-semibold">
        {text("การตั้งค่า", "Settings")}
      </h1>
      {loadError && (
        <Alert variant="destructive"><AlertDescription>
          {text(
            "โหลดข้อมูลองค์กรหรือการแจ้งเตือนไม่สำเร็จ กรุณาโหลดหน้าใหม่",
            "Unable to load organization or notification settings. Reload this page.",
          )}
        </AlertDescription></Alert>
      )}
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>
          {text("บัญชีผู้ใช้งานองค์กร", "Organization account")}
        </h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save(async () => {
              const result = await apiClient.put<{ displayName: string }>(
                "/v1/me/profile",
                { displayName: name },
              );
              if (user)
                authStore.setAuth(
                  { ...user, displayName: result.displayName },
                  authStore.getState().accessToken ?? undefined,
                );
            });
          }}
        >
          <Field>
            <FieldLabel htmlFor="organization-display-name">
              {text("ชื่อที่แสดง", "Display name")}
            </FieldLabel>
            <Input
              id="organization-display-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>
          <p className="text-sm">
            {text("อีเมล", "Email")}: {user?.email || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {text(
              "ติดต่อผู้ดูแลระบบเพื่อเปลี่ยนอีเมลบัญชี",
              "Contact an administrator to change your account email.",
            )}
          </p>
          <Button
            disabled={busy || !name.trim()}
            type="submit"
            className="min-h-11"
          >
            {text("บันทึกชื่อ", "Save display name")}
          </Button>
        </form>
      </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>
          {text("ข้อมูลนิติบุคคล", "Legal organization information")}
        </h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <p className="text-sm text-muted-foreground">
          {text(
            "ข้อมูลตามสัญญา อ่านได้อย่างเดียว ติดต่อเจ้าหน้าที่ภายในเพื่อแก้ไข",
            "Contract legal records are read-only. Contact internal staff to update them.",
          )}
        </p>
        {legal === null ? (
          <p>{text("กำลังโหลด", "Loading")}</p>
        ) : legal.length === 0 ? (
          <Empty><EmptyHeader><EmptyDescription>
            {text(
              "ยังไม่มีข้อมูลนิติบุคคล",
              "No legal organization records available",
            )}
          </EmptyDescription></EmptyHeader></Empty>
        ) : (
          legal.map((row) => (
            <dl
              key={row.id}
              className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-2"
            >
              {[
                [
                  text("องค์กร", "Organization"),
                  row.companyName || row.schoolName,
                ],
                [text("ไซต์งาน", "Site"), row.siteName],
                [text("เลขประจำตัวผู้เสียภาษี", "Tax ID"), row.taxId],
                [text("สาขาภาษี", "Tax branch"), row.taxBranch],
                [text("ที่อยู่", "Address"), row.taxAddress],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          ))
        )}
        <Link
          className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
          href="/contracts"
        >
          {text("เปิดเอกสาร", "Open documents")}
        </Link>
      </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>
          {text("การแสดงผล", "Display preferences")}
        </h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <Field>
          <FieldLabel htmlFor="organization-language">{text("ภาษา", "Language")}</FieldLabel>
          <ChoiceSelect
            id="organization-language"
            disabled={busy}
            value={locale}
            className={inputClass}
            onChange={(event) => {
              const value = event.target.value as "th" | "en";
              void save(async () => {
                await apiClient.put("/v1/me/preferences", {
                  preferredLanguage: value,
                });
                await setLocale(value);
              });
            }}
          >
            <option value="th">ภาษาไทย</option>
            <option value="en">English</option>
          </ChoiceSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="organization-theme">{text("ธีม", "Theme")}</FieldLabel>
          <ChoiceSelect
            id="organization-theme"
            disabled={!mounted || busy}
            value={mounted ? (theme ?? "system") : "system"}
            className={inputClass}
            onChange={(event) => {
              const value = event.target.value as "light" | "dark" | "system";
              void save(async () => {
                await apiClient.put("/v1/me/preferences", {
                  preferredTheme: value,
                });
                updatePreferences({ preferredTheme: value });
                setTheme(value);
              });
            }}
          >
            <option value="system">{text("ตามระบบ", "System")}</option>
            <option value="light">{text("สว่าง", "Light")}</option>
            <option value="dark">{text("มืด", "Dark")}</option>
          </ChoiceSelect>
        </Field>
      </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>
          {text("การแจ้งเตือน", "Notifications")}
        </h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        {notifications && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(() =>
                apiClient.put("/v1/notifications/settings", notifications),
              );
            }}
          >
            <Field orientation="horizontal">
              <Checkbox
                id="critical-email-alert"
                checked={notifications.criticalEmailAlert}
                onCheckedChange={(checked) =>
                  setNotifications({
                    ...notifications,
                    criticalEmailAlert: checked === true,
                  })
                }
              />
              <FieldLabel htmlFor="critical-email-alert">{text("อีเมลแจ้งเตือนสำคัญ", "Critical email alerts")}</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="in-app-notification"
                checked={notifications.inAppNotification}
                onCheckedChange={(checked) =>
                  setNotifications({
                    ...notifications,
                    inAppNotification: checked === true,
                  })
                }
              />
              <FieldLabel htmlFor="in-app-notification">{text("การแจ้งเตือนในระบบ", "In-app notifications")}</FieldLabel>
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-notification-email">
                {text("อีเมลรับการแจ้งเตือน", "Notification email")}
              </FieldLabel>
              <Input
                id="organization-notification-email"
                type="email"
                value={notifications.emailAddress}
                onChange={(event) =>
                  setNotifications({
                    ...notifications,
                    emailAddress: event.target.value,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Button disabled={busy} type="submit" className="min-h-11">
              {text("บันทึกการแจ้งเตือน", "Save notifications")}
            </Button>
          </form>
        )}
      </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>{text("รหัสผ่าน", "Password")}</h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const invalid = validateOrganizationPassword(
              password,
              confirmation,
              locale,
            );
            if (invalid) {
              setError(invalid);
              return;
            }
            void save(async () => {
              await submitOwnPasswordChange(
                currentPassword,
                password,
                confirmation,
                locale,
                {
                  update: (body) => apiClient.put("/v1/auth/password", body),
                  clear,
                  redirect: (path) => window.location.assign(path),
                },
              );
            });
          }}
        >
          {[
            {
              label: text("รหัสผ่านปัจจุบัน", "Current password"),
              value: currentPassword,
              set: setCurrentPassword,
              auto: "current-password",
            },
            {
              label: text("รหัสผ่านใหม่", "New password"),
              value: password,
              set: setPassword,
              auto: "new-password",
            },
            {
              label: text("ยืนยันรหัสผ่านใหม่", "Confirm new password"),
              value: confirmation,
              set: setConfirmation,
              auto: "new-password",
            },
          ].map((field) => (
            <Field key={field.auto + field.label}>
              <FieldLabel htmlFor={field.auto + field.label}>{field.label}</FieldLabel>
              <Input
                id={field.auto + field.label}
                className={inputClass}
                type="password"
                autoComplete={field.auto}
                required
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
              />
            </Field>
          ))}
          <Button disabled={busy} type="submit" className="min-h-11">
            {text("เปลี่ยนรหัสผ่าน", "Change password")}
          </Button>
        </form>
      </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved && <p role="status">{saved}</p>}
      <Button
        type="button"
        variant="destructive"
        className="min-h-11 bg-destructive dark:bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:hover:bg-destructive/90"
        onClick={() =>
          void save(async () => {
            await apiClient.post("/v1/auth/logout");
            clear();
            window.location.assign("/login");
          })
        }
      >
        {text("ออกจากระบบ", "Sign out")}
      </Button>
    </div>
  );
}

