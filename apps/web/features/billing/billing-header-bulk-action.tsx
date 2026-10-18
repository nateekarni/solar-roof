'use client';

import * as React from 'react';
import type {OperationPage, OperationRow} from '@solar/api-contracts';
import {FileCheck2} from 'lucide-react';
import {useRouter} from 'next/navigation';
import {Button} from '../../components/ui/button';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {apiClient} from '../../lib/api-client';
import {notify} from '../../components/feedback/notifications';
import {cn} from '../../lib/utils';
import {BillingBulkApproval} from './billing-bulk-approval';

export function BillingHeaderBulkAction({initialCount = 0}: {initialCount?: number}) {
  const locale = useLocale();
  const router = useRouter();
  const user = useSessionUser();
  const financial = useFinancialCapabilities();
  const canApprove = financial.operationsActions?.includes('approve_invoice') ?? false;

  const [count, setCount] = React.useState(initialCount);
  const [loading, setLoading] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [pendingRows, setPendingRows] = React.useState<OperationRow[]>([]);

  const approver = React.useMemo(() => ({
    displayName: user.displayName,
    position: user.companyPosition,
    hasSignature: user.hasSignature,
  }), [user]);

  const fetchPending = React.useCallback(async () => {
    try {
      const res = await apiClient.get<OperationPage<OperationRow>>('/v1/operations/billing?billingStatusView=pending_issue_approval&limit=100');
      const rows = res.rows || [];
      const total = res.facets?.billingStatusCounts?.pending_issue_approval ?? rows.length;
      setPendingRows(rows);
      setCount(total);
    } catch {
      // non-fatal initial fetch
    }
  }, []);

  React.useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const handleClick = async () => {
    if (count === 0 || !canApprove) return;
    setLoading(true);
    try {
      const res = await apiClient.get<OperationPage<OperationRow>>('/v1/operations/billing?billingStatusView=pending_issue_approval&limit=100');
      const rows = res.rows || [];
      const total = res.facets?.billingStatusCounts?.pending_issue_approval ?? rows.length;
      setPendingRows(rows);
      setCount(total);
      if (rows.length === 0) {
        notify.info(locale === 'th' ? 'ไม่มีรายการรออนุมัติออกเอกสาร' : 'No items awaiting issuance approval');
        return;
      }
      setModalOpen(true);
    } catch (e: any) {
      notify.error(e?.message || (locale === 'th' ? 'ไม่สามารถโหลดรายการรออนุมัติได้' : 'Failed to load pending items'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={count > 0 && canApprove ? 'default' : 'outline'}
        disabled={count === 0 || !canApprove || loading}
        onClick={handleClick}
        className={cn(
          'h-10 gap-2 px-4 text-sm font-semibold transition-colors',
          count > 0 && canApprove
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs cursor-pointer'
            : 'opacity-60 cursor-not-allowed text-muted-foreground'
        )}
      >
        <FileCheck2 className="size-4 shrink-0" />
        <span>
          {locale === 'th'
            ? `อนุมัติเอกสาร (${count})`
            : `Approve documents (${count})`}
        </span>
      </Button>

      {modalOpen && (
        <BillingBulkApproval
          rows={pendingRows}
          approver={approver}
          locale={locale}
          open={modalOpen}
          onOpenChange={setModalOpen}
          canApprove={canApprove}
          onCompleted={() => {
            void fetchPending();
            router.refresh();
          }}
        />
      )}
    </>
  );
}
