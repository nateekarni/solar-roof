"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import { Field, FieldLabel } from "../../components/ui/field";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Empty, EmptyHeader, EmptyDescription } from "../../components/ui/empty";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../stores/auth-store";
import { useLocale } from "../../providers/locale-provider";
import { apiClient } from "../../lib/api-client";
import { loadOrganizationRows } from "../organization/organization-document-loader";
import type { OrganizationDocument } from "../organization/organization-document-model";
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
  emailAddress: string;
}
export function CustomerSettingsView() {
  const locale = useLocale();
  const { user, clear } = useAuth();
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const [legal, setLegal] = useState<LegalContract[] | null>(null);
  const [notifications, setNotifications] = useState<Notifications | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
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
          {text("บัญชีของฉัน", "My Account")}
        </h2></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4 px-5 pb-5">
        <dl className="space-y-2 text-sm"><div><dt className="text-xs text-muted-foreground">{text("ชื่อ", "Name")}</dt><dd>{user?.displayName}</dd></div><div><dt className="text-xs text-muted-foreground">{text("อีเมล", "Email")}</dt><dd>{user?.email}</dd></div></dl><Link href="/settings/account" className="inline-flex min-h-11 items-center text-primary underline">{text("บัญชีของฉัน", "My Account")}</Link>

      </CardContent>
      </Card>
      <Card>
        <CardHeader className="px-5 pt-5"><CardTitle><h2>
          {text("ข้อมูลลูกค้าสำหรับเอกสาร", "Customer document information")}
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
              "ยังไม่มีข้อมูลลูกค้าสำหรับเอกสาร",
              "No customer document records available",
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
                  row.companyName || row.customerName,
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
