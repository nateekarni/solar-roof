"use client";

import * as React from "react";
import { formatAppDateTime } from "../../lib/date-format";
import { formatAuditAction, formatAuditEntityType, formatAuditActor } from "./audit-wording";
import { AuditDiffViewer } from "./audit-diff-viewer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Copy, Check, Clock } from "lucide-react";

export interface AuditRecordDetailsProps {
  row: Record<string, unknown>;
  locale?: "th" | "en";
}

function CopyableId({ label, id, locale }: { label: string; id: string; locale: "th" | "en" }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const short = id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs">
      <span title={id} className="rounded bg-muted/60 px-2 py-1 text-foreground border border-border/60">
        {short}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        onClick={copy}
        title={locale === "th" ? `คัดลอก ${label}` : `Copy ${label}`}
        aria-label={locale === "th" ? `คัดลอก ${label}` : `Copy ${label}`}
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function AuditRecordDetails({ row, locale = "th" }: AuditRecordDetailsProps) {
  const actionStr = String(row.action ?? "");
  const actionBadge = formatAuditAction(actionStr, locale);
  const timeStr = row.time ? formatAppDateTime(String(row.time), locale) : "—";
  const entityTypeStr = formatAuditEntityType(String(row.entityType ?? ""), locale);
  const actorStr = formatAuditActor(String(row.actor ?? ""), locale);
  const entityIdStr = row.entityId ? String(row.entityId) : null;
  const correlationIdStr = row.correlationId ? String(row.correlationId) : null;
  const reasonStr = row.reason ? String(row.reason) : null;
  const idStr = String(row.id ?? "");

  return (
    <div className="space-y-5">
      {/* Overview Card */}
      <Card>
        <CardHeader className="px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Badge
                variant={actionBadge.variant}
                className={`text-sm px-3 py-1 font-semibold ${actionBadge.badgeClass ?? ""}`}
              >
                {actionBadge.label}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <Clock className="size-3.5" />
                {timeStr}
              </span>
            </div>

            {idStr && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="text-muted-foreground/80">{locale === "th" ? "รหัสบันทึก:" : "Log ID:"}</span>
                <CopyableId label="Log ID" id={idStr} locale={locale} />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{locale === "th" ? "ประเภทข้อมูล" : "Resource Type"}</dt>
              <dd className="text-sm font-medium text-foreground">{entityTypeStr}</dd>
            </div>

            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{locale === "th" ? "ผู้ดำเนินการ" : "Actor"}</dt>
              <dd className="text-sm font-medium text-foreground">{actorStr}</dd>
            </div>

            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{locale === "th" ? "วันเวลาดำเนินการ" : "Timestamp"}</dt>
              <dd className="text-sm font-medium text-foreground">{timeStr}</dd>
            </div>

            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{locale === "th" ? "รหัสข้อมูลที่เกี่ยวข้อง" : "Reference ID"}</dt>
              <dd className="text-sm font-medium text-foreground">
                {entityIdStr ? (
                  <CopyableId label="Reference ID" id={entityIdStr} locale={locale} />
                ) : (
                  "—"
                )}
              </dd>
            </div>

            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{locale === "th" ? "รหัสเชื่อมโยง (Correlation ID)" : "Correlation ID"}</dt>
              <dd className="text-sm font-medium text-foreground">
                {correlationIdStr ? (
                  <CopyableId label="Correlation ID" id={correlationIdStr} locale={locale} />
                ) : (
                  "—"
                )}
              </dd>
            </div>

            {reasonStr && (
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <dt className="text-sm text-muted-foreground">{locale === "th" ? "เหตุผล" : "Reason"}</dt>
                <dd className="text-sm text-foreground bg-muted/30 p-3 rounded-lg border border-border/60">
                  {reasonStr}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Changes / Diff Card */}
      <Card>
        <CardHeader className="px-6 py-3.5 [.border-b]:pb-3.5 border-b border-border/60">
          <CardTitle className="text-base font-semibold">
            {locale === "th" ? "การเปลี่ยนแปลงข้อมูล (Changes)" : "Changes"}
          </CardTitle>
          <CardDescription className="text-xs">
            {locale === "th"
              ? "เปรียบเทียบข้อมูลก่อนและหลังการดำเนินการ (เครื่องหมาย - สีแดงคือค่าเดิม, + สีเขียวคือค่าใหม่)"
              : "Compare state before and after the action (- red is previous, + green is new)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <AuditDiffViewer before={row.beforeJson} after={row.afterJson} locale={locale} />
        </CardContent>
      </Card>
    </div>
  );
}
