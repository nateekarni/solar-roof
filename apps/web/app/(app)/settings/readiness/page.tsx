'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import type { FinancialReadinessStatus } from '@solar/api-contracts';
import { useLocale } from '../../../../providers/locale-provider';
import { useSessionUser } from '../../../../providers/session-user-provider';
import { apiClient } from '../../../../lib/api-client';
import { notify } from '../../../../components/feedback/notifications';
import { AppLoading } from '../../../../components/feedback/app-loading';
import { SetupChecklist } from '../../../../features/settings/setup-checklist';
import { Alert, AlertDescription, AlertTitle } from '../../../../components/ui/alert';
import { Button } from '../../../../components/ui/button';

export default function ReadinessSettingsPage() {
  const { role } = useSessionUser();
  const locale = useLocale();
  const th = locale === 'th';
  const isOwner = role === 'owner';

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [readiness, setReadiness] = React.useState<FinancialReadinessStatus | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const fetchReadiness = React.useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiClient.get<FinancialReadinessStatus>('/v1/settings/finance-readiness');
      setReadiness(data);
    } catch (err: any) {
      setError(
        err?.message || (th ? 'ไม่สามารถโหลดข้อมูลความพร้อมได้' : 'Failed to load readiness status')
      );
    } finally {
      setLoading(false);
    }
  }, [th]);

  React.useEffect(() => {
    if (isOwner) {
      void fetchReadiness();
    } else {
      setLoading(false);
    }
  }, [isOwner, fetchReadiness]);

  const handleConfirm = async () => {
    if (!isOwner || confirming) return;
    try {
      setConfirming(true);
      await apiClient.post('/v1/settings/finance-readiness/confirm', {});
      notify.success(
        th ? 'ยืนยันความพร้อมสำหรับการเงินจริงเรียบร้อยแล้ว' : 'Production readiness confirmed'
      );
      await fetchReadiness();
    } catch (err: any) {
      notify.error(
        err?.message || (th ? 'ไม่สามารถยืนยันความพร้อมได้' : 'Failed to confirm readiness')
      );
    } finally {
      setConfirming(false);
    }
  };

  if (!isOwner) {
    return (
      <main className="content">
        <div className="ops-content w-full max-w-4xl space-y-6">
          <Alert variant="destructive">
            <ShieldAlert className="size-4" />
            <AlertTitle>{th ? 'ไม่มีสิทธิ์เข้าถึง' : 'Access Restricted'}</AlertTitle>
            <AlertDescription>
              {th
                ? 'หน้านี้สำหรับเจ้าของระบบ (Owner) เท่านั้น'
                : 'This page is restricted to system owners.'}
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <ChevronLeft className="size-4 mr-1" />
              <span>{th ? 'กลับไปที่การตั้งค่า' : 'Back to Settings'}</span>
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  if (loading && !readiness) {
    return (
      <main className="content">
        <AppLoading
          message={
            th
              ? 'กำลังตรวจสอบรายการที่ต้องตั้งค่า…'
              : 'Checking setup checklist…'
          }
        />
      </main>
    );
  }

  return (
    <main className="content">
      <div className="ops-content w-full max-w-4xl space-y-6">
        {/* Navigation Back Link */}
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="size-4" />
            <span>{th ? 'การตั้งค่า' : 'Settings'}</span>
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2.5">
            <span>{th ? 'รายการข้อมูลที่ต้องตั้งค่าก่อนเริ่มใช้งาน' : 'Setup Checklist Before Go-Live'}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {th
              ? 'ตรวจสอบและตั้งค่าข้อมูลที่จำเป็นให้ครบถ้วนก่อนเปิดใช้งานระบบจริง'
              : 'Review and configure required settings before going live in production'}
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchReadiness()}>
                {th ? 'ลองอีกครั้ง' : 'Retry'}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {readiness && (
          <SetupChecklist
            status={readiness}
            locale={locale}
            isOwner={isOwner}
            confirming={confirming}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </main>
  );
}
