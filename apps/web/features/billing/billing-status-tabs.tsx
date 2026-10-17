'use client';
import type {BillingStatusView} from '@solar/api-contracts';
import {Tabs,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {Badge} from '../../components/ui/badge';
import {STATUS_MAP} from '../../lib/status-badge';
import {cn} from '../../lib/utils';

export const DEFAULT_STAFF_VIEWS: readonly BillingStatusView[] = [
  'all',
  'pending_issue_approval',
  'awaiting_payment',
  'pending_verification',
  'overdue',
  'paid',
  'unsuccessful',
];

export const CUSTOMER_VIEWS: readonly BillingStatusView[] = [
  'all',
  'awaiting_payment',
  'pending_verification',
  'overdue',
  'paid',
];

const views = DEFAULT_STAFF_VIEWS;
export function billingStatusTabId(panelId:string,value:BillingStatusView){return `${panelId}-tab-${views.indexOf(value)}`;}

export function BillingStatusTabs({
  value,
  counts,
  locale = 'th',
  panelId,
  views: customViews = DEFAULT_STAFF_VIEWS,
  onValueChange,
}: {
  value: BillingStatusView;
  counts?: Partial<Record<BillingStatusView, number>> | undefined;
  locale?: 'th' | 'en';
  panelId?: string;
  views?: readonly BillingStatusView[];
  onValueChange: (value: BillingStatusView) => void;
}) {
  const currentViews = customViews;
  const currentIndex = currentViews.indexOf(value);
  const selectedIndex = currentIndex >= 0 ? String(currentIndex) : '0';

  // Radix includes its values in DOM IDs; keep those IDs display-safe too.
  return (
    <Tabs
      className="min-w-0"
      value={selectedIndex}
      onValueChange={index => {
        const next = currentViews[Number(index)];
        if (next) onValueChange(next);
      }}
    >
      <TabsList
        aria-label={locale === 'th' ? 'สถานะใบวางบิล' : 'Billing statement status'}
        className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none"
      >
        {currentViews.map((view, index) => {
          const isActive = view === value;
          return (
            <TabsTrigger
              key={view}
              value={String(index)}
              {...(panelId ? { id: billingStatusTabId(panelId, view), 'aria-controls': panelId } : {})}
              className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none"
            >
              {view === 'all' ? (locale === 'th' ? 'ทั้งหมด' : 'All') : STATUS_MAP[view]![locale]}
              <Badge
                variant="secondary"
                className={cn(
                  "ml-1 text-[10px] h-5 px-1.5 rounded-full font-bold transition-colors",
                  isActive ? "bg-neutral-950 text-white border-0" : "bg-muted text-foreground border border-border/70"
                )}
              >
                {counts?.[view] ?? 0}
              </Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export function ReceiptStatusTabs({
  value,
  counts,
  locale = 'th',
  panelId,
  onValueChange,
}: {
  value: 'all' | 'paid';
  counts?: Partial<Record<'all' | 'paid', number>> | undefined;
  locale?: 'th' | 'en';
  panelId?: string;
  onValueChange: (value: 'all' | 'paid') => void;
}) {
  const receiptViews = ['all', 'paid'] as const;
  const currentIndex = receiptViews.indexOf(value);
  const selectedIndex = currentIndex >= 0 ? String(currentIndex) : '0';

  return (
    <Tabs
      className="min-w-0"
      value={selectedIndex}
      onValueChange={(index) => {
        const next = receiptViews[Number(index)];
        if (next) onValueChange(next);
      }}
    >
      <TabsList
        aria-label={locale === 'th' ? 'สถานะใบเสร็จรับเงิน' : 'Receipt status'}
        className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none"
      >
        {receiptViews.map((view, index) => {
          const isActive = view === value;
          const label = view === 'all'
            ? (locale === 'th' ? 'ทั้งหมด' : 'All')
            : (locale === 'th' ? 'ชำระแล้ว' : 'Paid');
          return (
            <TabsTrigger
              key={view}
              value={String(index)}
              {...(panelId ? { id: `${panelId}-receipt-tab-${view}`, 'aria-controls': panelId } : {})}
              className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none"
            >
              {label}
              {counts && counts[view] !== undefined && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1 text-[10px] h-5 px-1.5 rounded-full font-bold transition-colors",
                    isActive ? "bg-neutral-950 text-white border-0" : "bg-muted text-foreground border border-border/70"
                  )}
                >
                  {counts[view] ?? 0}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
