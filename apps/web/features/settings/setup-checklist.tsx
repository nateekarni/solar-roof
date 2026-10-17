'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { FinancialReadinessStatus, FinancialReadinessItem } from '@solar/api-contracts';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { formatAppDateTime } from '../../lib/date-format';
import { groupMissingReadiness, type ReadinessStep } from './readiness-steps';

interface SiteSummary {
  siteId: string;
  siteName: string;
  readyCount: number;
  totalCount: number;
  missingItems: Array<Omit<FinancialReadinessItem, 'destination'> & { label: string; destination: string | null }>;
}

function ReadinessStepCard({
  step,
  current,
  locale,
  isOwner,
  onEditCompany,
  siteSummaries,
}: {
  step: ReadinessStep;
  current: boolean;
  locale: 'th' | 'en';
  isOwner: boolean;
  onEditCompany?: (() => void) | undefined;
  siteSummaries: SiteSummary[];
}) {
  const th = locale === 'th';
  const [expandedOverride, setExpanded] = React.useState<boolean | null>(null);
  const [expandedSites, setExpandedSites] = React.useState<Record<string, boolean>>({});
  const expanded = expandedOverride ?? current;
  const contentId = React.useId();

  const toggleSite = (siteId: string) => {
    setExpandedSites((prev) => ({ ...prev, [siteId]: !prev[siteId] }));
  };

  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={`rounded-lg border ${current ? 'border-primary/40 bg-primary/5' : 'border-border'} p-3`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 font-medium">
          {step.title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {th ? `${step.items.length} รายการ` : `${step.items.length} pending`}
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <div id={contentId} hidden={!expanded}>
        {expanded && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>

            {step.key === 'sites' ? (
              /* Compact Site Readiness Breakdown: (X/Y) [Site Name] + [ตั้งค่า] */
              <div className="mt-3 space-y-2">
                {siteSummaries.map((site, siteIndex) => {
                  const isSiteExpanded = expandedSites[site.siteId] ?? (siteIndex === 0);
                  return (
                    <div
                      key={site.siteId}
                      className="rounded-md border border-border/70 bg-card p-2.5 text-sm transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleSite(site.siteId)}
                            className="inline-flex items-center gap-1.5 text-left font-medium hover:text-primary min-w-0 focus:outline-none"
                            aria-expanded={isSiteExpanded}
                            title={th ? 'แสดง/ซ่อน รายการที่ต้องตั้งค่า' : 'Toggle required items'}
                          >
                            <ChevronDown
                              className={`size-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${
                                isSiteExpanded ? 'rotate-180' : ''
                              }`}
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              <span className="font-semibold text-foreground mr-1.5">
                                ({site.readyCount}/{site.totalCount})
                              </span>
                              <span>{site.siteName}</span>
                            </span>
                          </button>
                        </div>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs bg-background hover:bg-muted font-medium border border-border shrink-0"
                        >
                          <Link href={`/records/sites/${encodeURIComponent(site.siteId)}`}>
                            {th ? 'ตั้งค่า' : 'Set up'}
                          </Link>
                        </Button>
                      </div>

                      {isSiteExpanded && (
                        <ul className="mt-2.5 space-y-1 pl-6 text-xs text-muted-foreground list-disc border-t border-border/40 pt-2">
                          {site.missingItems.map((item) => (
                            <li key={item.id} className="flex items-center justify-between pr-2">
                              <span>{item.label}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {item.responsibility === 'technical'
                                  ? (th ? 'ให้ทีมเทคนิคตรวจสอบ' : 'Ask the technical team')
                                  : (th ? 'เจ้าของ' : 'Owner')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Compact Company / Confirmation Checklist */
              <div className="mt-3 divide-y divide-border/60 rounded-md border border-border/60 bg-muted/20">
                {step.items.map((item) => (
                  <div
                    key={`${item.siteId || ''}-${item.id}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                  >
                    <span className="font-medium text-foreground">{item.label}</span>
                    {item.id !== 'approval.confirmation' &&
                      (isOwner && item.responsibility === 'owner' && item.destination ? (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs bg-background hover:bg-muted font-medium border border-border shrink-0"
                        >
                          <Link
                            href={item.destination}
                            onClick={() => {
                              if (step.key === 'company' && item.id !== 'company.default_bank') {
                                onEditCompany?.();
                              }
                            }}
                          >
                            {th ? 'ตั้งค่า' : 'Set up'}
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {item.responsibility === 'technical'
                            ? (th ? 'ให้ทีมเทคนิคตรวจสอบ' : 'Ask the technical team')
                            : item.responsibility === 'environment'
                            ? (th ? 'ให้ผู้ดูแลระบบที่ติดตั้งตรวจสอบ' : 'Ask the deployment administrator')
                            : (th ? 'ให้เจ้าของตรวจสอบ' : 'Ask the Owner')}
                        </span>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function SetupChecklist({
  status,
  locale,
  isOwner,
  confirming,
  onConfirm,
  onEditCompany,
  pendingChanges = false,
}: {
  status: FinancialReadinessStatus;
  locale: 'th' | 'en';
  isOwner: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onEditCompany?: (() => void) | undefined;
  pendingChanges?: boolean;
}) {
  const th = locale === 'th';
  // Filter out system environment and technical steps so only Owner actionable steps are rendered
  const allSteps = groupMissingReadiness(status, locale);
  const steps = allSteps.filter((step) => step.key !== 'environment' && step.key !== 'technical');

  // Group sites and calculate (X/Y) where X = readyCount, Y = totalCount
  const siteSummaries = React.useMemo<SiteSummary[]>(() => {
    const siteItemsMap = new Map<string, typeof status.items>();
    for (const item of status.items) {
      if (item.siteId) {
        const list = siteItemsMap.get(item.siteId) ?? [];
        list.push(item);
        siteItemsMap.set(item.siteId, list);
      }
    }

    const summaries: SiteSummary[] = [];
    const sitesStep = allSteps.find((s) => s.key === 'sites');

    for (const [siteId, items] of siteItemsMap.entries()) {
      const missingItems = sitesStep?.items.filter((i) => i.siteId === siteId) ?? [];
      if (missingItems.length === 0) continue; // Only include unready sites
      const totalCount = items.length;
      const readyCount = items.filter((i) => i.ready).length;
      const siteName = items.find((i) => i.siteName)?.siteName || (th ? 'ไซต์งาน' : 'Site');
      summaries.push({
        siteId,
        siteName,
        readyCount,
        totalCount,
        missingItems,
      });
    }

    return summaries;
  }, [status.items, allSteps, th]);

  const total = status.items.length;
  const completed = status.items.filter((item) => item.ready).length;
  const percent = total ? Math.round((completed / total) * 100) : 100;
  const progress = th ? `ครบแล้ว ${completed} จาก ${total} รายการ` : `${completed} of ${total} complete`;

  const globalOwnerComplete =
    status.items.some((item) => item.id.startsWith('company.')) &&
    status.items.some((item) => item.id === 'approval.confirmation') &&
    !status.items.some(
      (item) => item.responsibility === 'owner' && !item.siteId && item.id !== 'approval.confirmation' && !item.ready
    );

  const approved =
    status.scope === 'PRODUCTION' &&
    !!status.approval &&
    status.items.some((item) => item.id === 'approval.confirmation' && item.ready);

  const ready = approved && allSteps.length === 0;

  const title = ready
    ? th
      ? 'พร้อมใช้งานการเงินจริง'
      : 'Ready for production'
    : approved
    ? th
      ? 'ยืนยันข้อมูลสำหรับการเงินจริงแล้ว'
      : 'Production configuration confirmed'
    : globalOwnerComplete
    ? th
      ? 'รอการยืนยันจากเจ้าของ'
      : 'Awaiting Owner confirmation'
    : th
    ? 'รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน'
    : 'Setup Checklist Before Go-Live';

  return (
    <Card
      className="panel border-border/80 shadow-xs"
      aria-label={th ? 'รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน' : 'Setup Checklist Before Go-Live'}
    >
      <CardHeader className="p-0 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="text-sm font-medium" role="status">
          {progress}
        </p>
        <div
          role="progressbar"
          aria-label={th ? 'ความคืบหน้าการตั้งค่าการเงิน' : 'Finance setup progress'}
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={total ? completed : 1}
          aria-valuetext={progress}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
        <CardDescription>
          {th
            ? 'ตรวจสอบข้อมูลบริษัทก่อนยืนยัน การเปลี่ยนข้อมูลบริษัทหรือบัญชีธนาคารจะต้องยืนยันใหม่'
            : 'Review company information before confirming. Changes to company information or bank accounts require confirmation again.'}
        </CardDescription>
        {approved && status.approval && (
          <dl className="space-y-1 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{th ? 'ยืนยันโดย' : 'Confirmed by'}</dt>
              <dd>{th ? 'เจ้าของ' : 'Owner'}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{th ? 'ยืนยันเมื่อ' : 'Confirmed at'}</dt>
              <dd>
                <time dateTime={status.approval.approvedAt}>
                  {formatAppDateTime(status.approval.approvedAt, locale)}
                </time>
              </dd>
            </div>
          </dl>
        )}
        {status.scope === 'TEST' && (
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            {th ? 'TEST — โหมดทดสอบ ยังไม่ใช่การยืนยันสำหรับใช้งานจริง' : 'TEST — Test mode does not confirm production readiness.'}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0 space-y-4">
        {steps.length > 0 && (
          <ol aria-label={th ? 'ขั้นตอนที่ยังต้องดำเนินการ' : 'Remaining setup steps'} className="space-y-2">
            {steps.map((step, index) => (
              <ReadinessStepCard
                key={step.key}
                step={step}
                current={index === 0}
                locale={locale}
                isOwner={isOwner}
                onEditCompany={onEditCompany}
                siteSummaries={siteSummaries}
              />
            ))}
          </ol>
        )}
        {!approved && isOwner && (
          <>
            <Button
              type="button"
              className="h-auto min-h-10 whitespace-normal text-center"
              disabled={!globalOwnerComplete || confirming || pendingChanges}
              onClick={onConfirm}
            >
              {confirming
                ? th
                  ? 'กำลังยืนยัน…'
                  : 'Confirming…'
                : th
                ? 'ยืนยันความพร้อมสำหรับการเงินจริง'
                : 'Confirm production readiness'}
            </Button>
            {pendingChanges && (
              <p className="text-sm text-muted-foreground">
                {th ? 'บันทึกหรือยกเลิกการแก้ไขก่อนยืนยัน' : 'Save or cancel your edits before confirming.'}
              </p>
            )}
          </>
        )}
        {approved && steps.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {th
              ? 'ข้อมูลบริษัทได้รับการยืนยันแล้ว แต่การดำเนินการบางอย่างยังรอรายการข้างต้น แต่ละไซต์งานจะตรวจสอบความพร้อมแยกกัน'
              : 'Company information is confirmed. Some actions still await the requirements above. Each site is checked separately.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export const FinanceReadinessCard = SetupChecklist;
