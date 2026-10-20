"use client";
import { useEffect, useState } from "react";
import { useT } from "../../../providers/locale-provider";
import { useAuth } from "../../../stores/auth-store";
import { apiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import { customerAccountCard } from "./customer-account-presentation";

interface Notifications {
  criticalEmailAlert: boolean;
  inAppNotification: boolean;
  emailAddress?: string;
}
export function CustomerNotificationCard() {
  const t = useT(),
    { user } = useAuth();
  const [preferences, setPreferences] = useState<Notifications | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiClient
      .get<Notifications>("/v1/notifications/settings")
      .then((data) => {
        if (active) setPreferences(data);
      })
      .catch(() => {
        if (active) setError("customerPortal.account.notificationsUnavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function update(
    key: "criticalEmailAlert" | "inAppNotification",
    checked: boolean,
  ) {
    if (!preferences || busy || loading) return;
    const previous = preferences;
    const next = {
      ...preferences,
      [key]: checked,
      emailAddress: user?.email || preferences.emailAddress || "",
    };
    setPreferences(next);
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      await apiClient.put("/v1/notifications/settings", next);
      setSaved(true);
    } catch {
      setPreferences(previous);
      setError("customerPortal.account.notificationsFailed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={customerAccountCard}
      aria-labelledby="customer-notifications-title"
    >
      <div data-customer-card-heading="true" className="space-y-1">
        <h2 id="customer-notifications-title" className="text-lg font-semibold">
          {t("customerPortal.account.notifications")}
        </h2>
        <p className="break-words text-sm text-muted-foreground">
          {t("customerPortal.account.notificationDelivery", {
            email: user?.email ?? "",
          })}
        </p>
      </div>
      {loading && <p role="status">{t("customerPortal.common.loading")}</p>}
      {error && (
        <div role="alert" className="space-y-3">
          <p>{t(error)}</p>
          {!preferences && (
            <Button
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("customerPortal.common.retry")}
            </Button>
          )}
        </div>
      )}
      {saved && <p role="status">{t("customerPortal.account.saved")}</p>}
      <div
        data-customer-account-list="true"
        className="[&>*]:border-t-0"
      >
        {(["criticalEmailAlert", "inAppNotification"] as const).map((key) => (
          <div
            key={key}
            className="flex min-h-14 items-center justify-between gap-4 py-3"
          >
            <Label
              className="min-w-0 leading-relaxed"
              htmlFor={`customer-${key}`}
            >
              {t(`customerPortal.account.${key}`)}
            </Label>
            <Switch
              id={`customer-${key}`}
              className="h-[18.4px]! min-h-0! w-8! min-w-0! shrink-0"
              disabled={!preferences || loading || busy}
              checked={preferences?.[key] ?? false}
              onCheckedChange={(checked) => void update(key, checked)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
