'use client';
import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';

export interface BillingSettingsData {
  serviceStartDate: string;
  paymentTermDays: number;
  taxRate: string;
  taxConfirmed: boolean;
  pricesIncludeTax: boolean;
  recipientUserIds: string[];
  remindersEnabled?: boolean;
  reminderStartDays?: number;
  reminderIntervalDays?: number;
}

export function SiteBillingDisplayCard({ siteId }: { siteId: string }) {
  const th = useLocale() === 'th';
  const [settings, setSettings] = useState<BillingSettingsData | null>(null);
  const [users, setUsers] = useState<{ id: string; displayName: string; email: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiClient
      .get<BillingSettingsData & { recipientOptions?: { id: string; displayName: string; email: string }[] }>(
        `/v1/sites/${siteId}/billing-settings`
      )
      .then((data) => {
        if (active) {
          setSettings(data);
          setUsers(data.recipientOptions ?? []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [siteId]);

  const recipientUsers = (settings?.recipientUserIds ?? [])
    .map((uid) => users.find((u) => u.id === uid))
    .filter(Boolean) as { id: string; displayName: string; email: string }[];

  return (
    <Card>
      <CardHeader className="py-5">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          {th ? 'การเรียกเก็บเงินของไซต์งาน' : 'Site billing settings'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">{th ? 'กำลังโหลดการตั้งค่า…' : 'Loading settings…'}</p>
        ) : !settings ? (
          <p className="text-sm text-muted-foreground">{th ? 'ไม่พบข้อมูลการตั้งค่า' : 'No settings found'}</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'วันที่เริ่มบริการ' : 'Service start date'}</dt>
              <dd className="text-sm font-medium">{settings.serviceStartDate || '—'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'ระยะเวลาชำระ' : 'Payment term'}</dt>
              <dd className="text-sm font-medium">
                {settings.paymentTermDays !== undefined && settings.paymentTermDays !== null
                  ? `${settings.paymentTermDays} ${th ? 'วัน' : 'days'}`
                  : '—'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'อัตราภาษี' : 'Tax rate'}</dt>
              <dd className="text-sm font-medium">{settings.taxRate ? `${settings.taxRate}%` : '—'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'รูปแบบราคา' : 'Price mode'}</dt>
              <dd className="text-sm font-medium">
                {settings.pricesIncludeTax
                  ? (th ? 'รวมภาษีแล้ว' : 'Tax included')
                  : (th ? 'ยังไม่รวมภาษี' : 'Tax excluded')}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'เริ่มทวงหลังครบกำหนด' : 'Reminder start'}</dt>
              <dd className="text-sm font-medium">
                {settings.reminderStartDays !== undefined && settings.reminderStartDays !== null
                  ? `${settings.reminderStartDays} ${th ? 'วัน' : 'days'}`
                  : '—'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'ทวงทุก' : 'Reminder interval'}</dt>
              <dd className="text-sm font-medium">
                {settings.reminderIntervalDays !== undefined && settings.reminderIntervalDays !== null
                  ? `${settings.reminderIntervalDays} ${th ? 'วัน' : 'days'}`
                  : '—'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'การทวงชำระ' : 'Payment reminders'}</dt>
              <dd className="text-sm font-medium">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    settings.remindersEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {settings.remindersEnabled
                    ? (th ? 'เปิดใช้งาน' : 'Enabled')
                    : (th ? 'ปิดใช้งาน' : 'Disabled')}
                </span>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">{th ? 'การยืนยันภาษี' : 'Tax confirmation'}</dt>
              <dd className="text-sm font-medium">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    settings.taxConfirmed
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {settings.taxConfirmed
                    ? (th ? 'ผู้รับผิดชอบบัญชียืนยันแล้ว' : 'Confirmed by accounting')
                    : (th ? 'ยังไม่ยืนยัน' : 'Not confirmed')}
                </span>
              </dd>
            </div>
            <div className="space-y-1 sm:col-span-2 xl:col-span-3">
              <dt className="text-sm text-muted-foreground">{th ? 'ผู้รับเอกสาร' : 'Document recipients'}</dt>
              <dd className="mt-1">
                {recipientUsers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {recipientUsers.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground"
                      >
                        {u.displayName} ({u.email})
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {th ? 'ไม่มีผู้รับเอกสารที่เลือก' : 'No recipients selected'}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
