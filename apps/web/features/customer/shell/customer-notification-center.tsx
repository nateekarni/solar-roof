"use client";

import * as React from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../../components/ui/empty";
import { ResponsivePopover } from "../../../components/ui/responsive-popover";
import { Skeleton } from "../../../components/ui/skeleton";
import { NotificationFeedRow } from "../../../components/navigation/notification-bell";
import {
  accessibleFeedRows,
  markFeedRead,
  type NotificationFeed,
} from "../../../components/navigation/notification-feed-state";
import { apiClient } from "../../../lib/api-client";
import { useLocale, useT } from "../../../providers/locale-provider";
import { useAuth } from "../../../stores/auth-store";

export function CustomerNotificationCenter() {
  const t = useT();
  const th = useLocale() === "th";
  const { user } = useAuth();
  const scope = JSON.stringify([user?.id, user?.role, user?.customerId]);
  const currentScope = React.useRef(scope);
  currentScope.current = scope;
  const generation = React.useRef(0);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loaded, setLoaded] = React.useState("");
  const [feed, setFeed] = React.useState<NotificationFeed>({
    rows: [],
    unreadCount: 0,
  });
  const ready = loaded === scope;
  const rows = ready ? feed.rows : [];
  const unreadCount = ready ? feed.unreadCount : 0;

  const load = React.useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await apiClient.get<NotificationFeed>(
        "/v1/me/notification-feed",
      );
      if (request !== generation.current || currentScope.current !== scope)
        return;
      const permitted = accessibleFeedRows(result.rows, user?.role ?? "customer_user");
      setFeed({
        rows: permitted,
        unreadCount:
          permitted.length === result.rows.length
            ? result.unreadCount
            : permitted.filter((row) => !row.readAt).length,
      });
      setLoaded(scope);
    } catch {
      if (request !== generation.current || currentScope.current !== scope)
        return;
      setError(t("customerPortal.shell.notificationsUnavailable"));
      setFeed({ rows: [], unreadCount: 0 });
      setLoaded(scope);
    } finally {
      if (request === generation.current && currentScope.current === scope)
        setLoading(false);
    }
  }, [scope, t, user?.role]);

  React.useEffect(() => {
    setBusy(false);
    setOpen(false);
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      generation.current += 1;
      window.removeEventListener("focus", refresh);
      window.clearInterval(interval);
    };
  }, [load]);

  async function read(ids?: string[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    const originalScope = scope;
    try {
      await markFeedRead(
        apiClient,
        originalScope,
        () => currentScope.current,
        () => void load(),
        ids ? { ids } : {},
      );
    } catch {
      if (currentScope.current === originalScope)
        setError(t("customerPortal.shell.notificationsReadFailed"));
    } finally {
      if (currentScope.current === originalScope) setBusy(false);
    }
  }

  return (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
      title={t("customerPortal.shell.notifications")}
      sheetHeaderClassName="sr-only"
      showCloseButton={false}
      popoverClassName="customer-portal flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-xl"
      sheetClassName="customer-portal fixed! inset-0! flex h-dvh! min-h-dvh! max-h-none! w-screen! max-w-none! flex-col gap-0! overflow-hidden rounded-none! border-0! bg-background p-0! shadow-none!"
      trigger={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="customer-notification-trigger relative h-11! w-11! rounded-full bg-background p-0"
          aria-label={t("customerPortal.shell.notifications")}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              data-customer-notification-unread="true"
              className="absolute right-1 top-1 size-2 rounded-full bg-destructive ring-2 ring-background"
            />
          )}
          <span className="sr-only">{unreadCount}</span>
        </Button>
      }
    >
      <section
        data-customer-notification-center="true"
        aria-labelledby="customer-notification-title"
        className="flex min-h-0 flex-1 flex-col"
      >
        <header
          data-customer-notification-header="true"
          className="flex h-[73px] min-h-[73px] w-full items-center justify-between gap-3 border-b border-border px-4 py-2 text-left md:h-auto md:min-h-0 md:px-3 md:py-3"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 id="customer-notification-title" className="text-lg font-semibold md:text-base">
                {t("customerPortal.shell.notifications")}
              </h2>
              {unreadCount > 0 && <Badge variant="secondary">{unreadCount}</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {t("customerPortal.shell.notificationDescription")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11! w-11!"
              disabled={busy || loading || !ready || unreadCount === 0}
              onClick={() => void read()}
              aria-label={t("customerPortal.shell.markAllNotificationsRead")}
              title={t("customerPortal.shell.markAllNotificationsRead")}
            >
              <CheckCheck aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11! w-11!"
              onClick={() => setOpen(false)}
              aria-label={t("customerPortal.common.close")}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto md:max-h-96">
          <div className="w-full p-4 md:p-0">
            {error && (
              <Alert variant="destructive" className="mb-4 md:m-3 md:w-auto">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button type="button" variant="outline" onClick={() => void load()}>
                    {t("customerPortal.common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {loading || !ready ? (
              <div
                className="space-y-3 md:p-4"
                role="status"
                aria-label={t("customerPortal.shell.notificationsLoading")}
              >
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : !error && rows.length === 0 ? (
              <Empty className="min-h-[50dvh] border-0 md:min-h-52 md:rounded-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                  <EmptyTitle>{t("customerPortal.shell.notificationsEmpty")}</EmptyTitle>
                  <EmptyDescription>
                    {t("customerPortal.shell.notificationsEmptyDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card md:rounded-none md:border-0">
                {rows.map((row) => (
                  <NotificationFeedRow
                    key={row.id}
                    row={row}
                    th={th}
                    customerFacing
                    onRead={(id) => void read([id])}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </ResponsivePopover>
  );
}
