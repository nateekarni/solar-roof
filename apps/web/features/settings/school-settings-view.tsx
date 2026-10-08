"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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
  const inputClass = "min-h-11 w-full max-w-md rounded-md border bg-card px-3";
  return (
    <div className="w-full space-y-5 pb-8">
      <h1 className="text-2xl font-semibold">
        {text("การตั้งค่า", "Settings")}
      </h1>
      {loadError && (
        <p role="alert" className="text-destructive">
          {text(
            "โหลดข้อมูลองค์กรหรือการแจ้งเตือนไม่สำเร็จ กรุณาโหลดหน้าใหม่",
            "Unable to load organization or notification settings. Reload this page.",
          )}
        </p>
      )}
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          {text("บัญชีผู้ใช้งานองค์กร", "Organization account")}
        </h2>
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
          <label className="block space-y-1">
            <span className="block text-sm">
              {text("ชื่อที่แสดง", "Display name")}
            </span>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
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
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          {text("ข้อมูลนิติบุคคล", "Legal organization information")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {text(
            "ข้อมูลตามสัญญา อ่านได้อย่างเดียว ติดต่อเจ้าหน้าที่ภายในเพื่อแก้ไข",
            "Contract legal records are read-only. Contact internal staff to update them.",
          )}
        </p>
        {legal === null ? (
          <p>{text("กำลังโหลด", "Loading")}</p>
        ) : legal.length === 0 ? (
          <p>
            {text(
              "ยังไม่มีข้อมูลนิติบุคคล",
              "No legal organization records available",
            )}
          </p>
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
          className="inline-flex min-h-11 items-center text-primary"
          href="/contracts"
        >
          {text("เปิดเอกสาร", "Open documents")}
        </Link>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          {text("การแสดงผล", "Display preferences")}
        </h2>
        <label className="block space-y-1">
          <span className="block text-sm">{text("ภาษา", "Language")}</span>
          <select
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
          </select>
        </label>
        <label className="block space-y-1">
          <span className="block text-sm">{text("ธีม", "Theme")}</span>
          <select
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
          </select>
        </label>
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          {text("การแจ้งเตือน", "Notifications")}
        </h2>
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
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={notifications.criticalEmailAlert}
                onChange={(event) =>
                  setNotifications({
                    ...notifications,
                    criticalEmailAlert: event.target.checked,
                  })
                }
              />
              {text("อีเมลแจ้งเตือนสำคัญ", "Critical email alerts")}
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={notifications.inAppNotification}
                onChange={(event) =>
                  setNotifications({
                    ...notifications,
                    inAppNotification: event.target.checked,
                  })
                }
              />
              {text("การแจ้งเตือนในระบบ", "In-app notifications")}
            </label>
            <label className="block space-y-1">
              <span className="block text-sm">
                {text("อีเมลรับการแจ้งเตือน", "Notification email")}
              </span>
              <input
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
            </label>
            <Button disabled={busy} type="submit" className="min-h-11">
              {text("บันทึกการแจ้งเตือน", "Save notifications")}
            </Button>
          </form>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{text("รหัสผ่าน", "Password")}</h2>
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
            <label key={field.auto + field.label} className="block space-y-1">
              <span className="block text-sm">{field.label}</span>
              <input
                className={inputClass}
                type="password"
                autoComplete={field.auto}
                required
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
              />
            </label>
          ))}
          <Button disabled={busy} type="submit" className="min-h-11">
            {text("เปลี่ยนรหัสผ่าน", "Change password")}
          </Button>
        </form>
      </section>
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
