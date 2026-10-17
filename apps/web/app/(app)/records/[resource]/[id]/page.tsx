import { RecordNavigationControls } from '../../../../../features/shared/record-navigation-controls';
import { recordBackLink } from '../../../../../features/shared/record-back-link';
import { SiteBillingDisplayCard } from '../../../../../features/sites/site-billing-display-card';
import { SiteManageHeaderButton } from '../../../../../features/sites/site-manage-modal';
import { SiteDetailTabs } from '../../../../../features/sites/site-detail-tabs';
import { SiteCustomerUsers } from '../../../../../features/sites/site-customer-users';
import { requirePageAccess } from '../../../../../lib/session-user';
import { SiteConfigurationDetails } from '../../../../../features/sites/site-configuration-details';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { serverFetch, getApiBaseUrl } from '../../../../../lib/server-fetch';
import { operationKeys } from '../../../../../features/shared/operation-columns';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card';
import { RecordDetails } from '../../../../../features/shared/record-details';
import { AuditRecordDetails } from '../../../../../features/shared/audit-record-details';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ resource: string; id: string }>;
}) {
  const { resource, id } = await params;
  const back: Record<string, string> = {
    sites: '/sites',
    customers: '/customers',
    billing: '/billing',
    documents: '/billing',
    receipts: '/receipts',
    alerts: '/alerts',
    notifications: '/notifications',
    reports: '/reports',
    users: '/settings/users',
    audit: '/settings/audit',
  };
  if (!back[resource]) notFound();
  const user = await requirePageAccess(back[resource]);
  const res = await serverFetch(
    `${getApiBaseUrl()}/v1/operations/${resource}/records/${encodeURIComponent(id)}`,
    { cache: 'no-store' }
  );
  if (res.status === 404 || res.status === 403) notFound();
  if (!res.ok) throw new Error('Unable to load record');
  const { row, columns } = await res.json();
  const th = (await cookies()).get('locale')?.value !== 'en';
  const backLink = recordBackLink(resource, user.role, back[resource]!, th ? 'th' : 'en');
  const fields = operationKeys(resource, row);

  if (resource === 'billing' || resource === 'receipts') {
    return (
      <main className="content">
        <div className="ops-content w-full space-y-5">
          <RecordNavigationControls
            resource={resource}
            id={id}
            locale={th ? 'th' : 'en'}
            siteName={row.siteName}
            period={row.period}
          />
          <RecordDetails resource={resource} row={row} fields={fields} columns={columns} />
        </div>
      </main>
    );
  }

  const canManageSite = resource === 'sites' && user.role === 'owner';

  return (
    <main className="content">
      <div className="ops-content w-full space-y-4">
        <div>
          <Link
            href={backLink.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50"
          >
            <ArrowLeft className="size-4 shrink-0" />
            {backLink.label}
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {resource === 'sites'
                ? th
                  ? 'รายละเอียดไซต์งาน'
                  : 'Site details'
                : resource === 'audit'
                  ? th
                    ? 'รายละเอียดบันทึกประวัติการทำงาน'
                    : 'Audit log details'
                : th
                  ? 'รายละเอียดรายการ'
                  : 'Record details'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {resource === 'sites'
                ? th
                  ? 'จัดการข้อมูลไซต์งานและการตั้งค่าบริการ'
                  : 'Manage site information and service settings'
                : resource === 'audit'
                  ? th
                    ? 'ดูประวัติการดำเนินการและการเปลี่ยนแปลงข้อมูลในระบบ'
                    : 'View operation history and system changes'
                : th
                  ? 'ดูรายละเอียดและสถานะของข้อมูลในระบบ'
                  : 'View record details and system status'}
            </p>
          </div>
          {canManageSite && <SiteManageHeaderButton siteId={id} />}
        </div>

        {resource === 'sites' ? (
          <SiteDetailTabs siteId={id} canManageUsers={false}>
            <Card>
              <CardHeader className="py-5">
                <CardTitle>
                  {row.name || row.title || row.displayName || row.documentNumber || row.period || id}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <RecordDetails resource={resource} row={row} fields={fields} columns={columns} />
              </CardContent>
            </Card>

            {/* Display Value for Site Billing Settings */}
            <SiteBillingDisplayCard siteId={id} />

            {/* Site Customer Users section for Owner */}
            {user.role === 'owner' && (
              <SiteCustomerUsers siteId={id} />
            )}

            {/* Technical details for Technical staff */}
            {['admin', 'operator'].includes(user.role) && (
              <SiteConfigurationDetails siteId={id} />
            )}
          </SiteDetailTabs>
        ) : resource === 'audit' ? (
          <AuditRecordDetails row={row} locale={th ? 'th' : 'en'} />
        ) : (
          <Card>
            <CardHeader className="py-5">
              <CardTitle>
                {row.name || row.title || row.displayName || row.documentNumber || row.period || id}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <RecordDetails resource={resource} row={row} fields={fields} columns={columns} />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
