import {AlertTriangle} from 'lucide-react';import Link from 'next/link';import type {DashboardSummaryAlert} from '@solar/api-contracts';import {createTranslator,type Locale} from '@solar/i18n';import {Card,CardHeader,CardTitle,CardContent} from '../../components/ui/card';import {renderStatusBadge} from '../../lib/status-badge';import {dashboardLayout} from './dashboard-layout';
export function DashboardAlertsCard({alerts,role,locale}:{alerts:DashboardSummaryAlert[];role:string;locale:Locale}){const t=createTranslator(locale);return <Card className="panel flex flex-col flex-1 h-full justify-between">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t("dashboard.liveHealth")}
                </CardTitle>
                {dashboardLayout(role).alertsLink&&<Link
                  href="/alerts"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t("dashboard.all")}
                </Link>}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
              {alerts.length === 0 ? (
                <div className="flex min-h-32 flex-1 flex-col items-center justify-center gap-3 text-center text-xs text-muted-foreground"><AlertTriangle className="size-7 text-muted-foreground/50" />
                  {t("dashboard.noAlerts")}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.slice(0, 5).map((alert: DashboardSummaryAlert, idx: number) => {
                    const isCritical =
                      alert.severity === "critical" ||
                      alert.status === "ออฟไลน์";
                    return (
                      <div
                        className="flex items-center justify-between gap-3 py-2"
                        key={`${alert.title}-${idx}`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div
                            className={`grid size-6 shrink-0 place-items-center rounded-md mt-0.5 ${
                              isCritical
                                ? "bg-destructive/10 text-destructive"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            <AlertTriangle className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <span className="truncate text-xs font-semibold text-foreground leading-tight">
                              {alert.title}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground leading-tight">
                              {alert.detail}
                            </span>
                          </div>
                        </div>
                        {renderStatusBadge(alert.status, locale)}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>;}
