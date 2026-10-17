'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Info, ShieldAlert } from 'lucide-react';
import type { DashboardSummaryAlert } from '@solar/api-contracts';
import { canVisitPage } from '@solar/domain';
import { createTranslator, type Locale } from '@solar/i18n';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { renderStatusBadge } from '../../lib/status-badge';
import { dashboardLayout } from './dashboard-layout';

export function formatAlertTimestamp(timestampStr: string, locale: Locale): string {
  try {
    const d = new Date(timestampStr);
    if (isNaN(d.getTime())) return timestampStr;
    return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(d);
  } catch {
    return timestampStr;
  }
}

export function TechnicalAlertGuidanceDialog({
  alert,
  open,
  onOpenChange,
  locale,
  inline = false,
}: {
  alert: DashboardSummaryAlert | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  inline?: boolean | undefined;
}) {
  const content = alert ? (
    <div className="flex flex-col gap-3 py-2">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
        {alert.siteName && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {locale === 'th' ? 'ไซต์งาน' : 'Site'}
            </span>
            <span className="font-semibold text-foreground">
              {alert.siteName}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {locale === 'th' ? 'หัวข้อ' : 'Title'}
          </span>
          <span className="font-medium text-foreground">
            {alert.title}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {locale === 'th' ? 'รายละเอียด' : 'Detail'}
          </span>
          <span className="text-muted-foreground text-right truncate max-w-[240px]">
            {alert.detail}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {locale === 'th' ? 'สถานะ' : 'Status'}
          </span>
          <div>{renderStatusBadge(alert.status, locale)}</div>
        </div>
        {alert.occurred_at && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {locale === 'th' ? 'เวลาที่เกิด' : 'Occurred'}
            </span>
            <span className="text-muted-foreground">
              {formatAlertTimestamp(alert.occurred_at, locale)}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-start gap-2.5 text-xs text-warning-emphasis">
        <Info className="size-4 shrink-0 mt-0.5 text-warning-emphasis" />
        <p className="leading-relaxed">
          {locale === 'th'
            ? 'การแจ้งเตือนนี้เป็นข้อมูลทางเทคนิคของอุปกรณ์ในไซต์งาน กรุณาประสานงานเจ้าหน้าที่เทคนิคหรือผู้ดูแลระบบเพื่อตรวจสอบและดำเนินการแก้ไข'
            : 'This is a technical equipment alert. Please notify the technical staff or system administrator to inspect and resolve the issue.'}
        </p>
      </div>
    </div>
  ) : null;

  if (inline) {
    if (!open) return null;
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm max-w-md">
        <header className="mb-4">
          <div className="flex items-center gap-2 text-warning-emphasis mb-1">
            <ShieldAlert className="size-5 text-warning-emphasis" />
            <h2 className="text-base font-semibold">
              {locale === 'th' ? 'การแจ้งเตือนทางเทคนิค' : 'Technical Alert'}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {locale === 'th'
              ? 'ข้อมูลการแจ้งเตือนของอุปกรณ์สำหรับไซต์งานนี้'
              : 'Equipment alert information for this site.'}
          </p>
        </header>

        {content}

        <footer className="mt-4 pt-2 flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {locale === 'th' ? 'รับทราบ' : 'Acknowledge'}
          </Button>
        </footer>
      </section>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning-emphasis mb-1">
            <ShieldAlert className="size-5 text-warning-emphasis" />
            <DialogTitle className="text-base font-semibold">
              {locale === 'th' ? 'การแจ้งเตือนทางเทคนิค' : 'Technical Alert'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {locale === 'th'
              ? 'ข้อมูลการแจ้งเตือนของอุปกรณ์สำหรับไซต์งานนี้'
              : 'Equipment alert information for this site.'}
          </DialogDescription>
        </DialogHeader>

        {content}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {locale === 'th' ? 'รับทราบ' : 'Acknowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardAlertsCard({
  alerts,
  role,
  locale,
  initialAlert = null,
  inlineDialog = false,
}: {
  alerts: DashboardSummaryAlert[];
  role: string;
  locale: Locale;
  initialAlert?: DashboardSummaryAlert | null | undefined;
  inlineDialog?: boolean | undefined;
}) {
  const t = createTranslator(locale);
  const [guidanceAlert, setGuidanceAlert] = React.useState<DashboardSummaryAlert | null>(initialAlert);

  return (
    <>
      <Card className="panel flex flex-col flex-1 h-full justify-between">
        <CardHeader className="p-0 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              {t('dashboard.liveHealth')}
            </CardTitle>
            {dashboardLayout(role).alertsLink && (
              <Link
                href="/alerts"
                className="text-xs font-semibold text-primary hover:underline"
              >
                {t('dashboard.all')}
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
          {alerts.length === 0 ? (
            <div className="flex min-h-32 flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
              <Bell className="size-6 text-muted-foreground/40" />
              <span>{locale === 'th' ? 'ไม่มีการแจ้งเตือนใหม่' : 'No new notifications'}</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {alerts.slice(0, 5).map((alert: DashboardSummaryAlert, idx: number) => {
                const isCritical =
                  alert.severity === 'critical' ||
                  alert.status === 'offline' ||
                  alert.status === 'ออฟไลน์';
                const isAlert =
                  alert.kind === 'alert' ||
                  isCritical ||
                  alert.severity === 'warning' ||
                  alert.status === 'warning';
                const isAccessible = Boolean(
                  alert.destination && canVisitPage(role, alert.destination)
                );

                const itemContent = (
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div
                      className={`grid size-7 shrink-0 place-items-center rounded-md mt-0.5 ${
                        isCritical
                          ? 'bg-destructive/10 text-destructive'
                          : isAlert
                          ? 'bg-warning/15 text-warning-emphasis'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {isAlert ? (
                        <AlertTriangle className="size-4" />
                      ) : (
                        <Bell className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {alert.siteName && (
                          <>
                            <span className="font-semibold text-xs text-foreground truncate max-w-[120px]">
                              {alert.siteName}
                            </span>
                            <span className="text-muted-foreground/60 text-xs shrink-0">·</span>
                          </>
                        )}
                        <span className="truncate text-xs font-medium text-foreground leading-tight">
                          {alert.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground leading-tight">
                        <span className="truncate max-w-[180px]">{alert.detail}</span>
                        {alert.occurred_at && (
                          <>
                            <span className="text-muted-foreground/60 shrink-0">·</span>
                            <span className="whitespace-nowrap shrink-0">
                              {formatAlertTimestamp(alert.occurred_at, locale)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );

                if (isAccessible && alert.destination) {
                  return (
                    <Link
                      key={`${alert.id ?? alert.title}-${idx}`}
                      href={alert.destination}
                      className="flex items-center justify-between gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group text-left"
                    >
                      {itemContent}
                      {renderStatusBadge(alert.status, locale)}
                    </Link>
                  );
                }

                if (isAlert) {
                  return (
                    <button
                      key={`${alert.id ?? alert.title}-${idx}`}
                      type="button"
                      onClick={() => setGuidanceAlert(alert)}
                      className="flex items-center justify-between gap-3 py-2 px-1 -mx-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group text-left w-full border-0 bg-transparent"
                    >
                      {itemContent}
                      {renderStatusBadge(alert.status, locale)}
                    </button>
                  );
                }

                return (
                  <div
                    key={`${alert.id ?? alert.title}-${idx}`}
                    className="flex items-center justify-between gap-3 py-2 px-1 -mx-1"
                  >
                    {itemContent}
                    {renderStatusBadge(alert.status, locale)}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <TechnicalAlertGuidanceDialog
        alert={guidanceAlert}
        open={Boolean(guidanceAlert)}
        onOpenChange={(open) => !open && setGuidanceAlert(null)}
        locale={locale}
        inline={inlineDialog}
      />
    </>
  );
}
