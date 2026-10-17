'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useLocale } from '../../providers/locale-provider';
import { useSessionUser } from '../../providers/session-user-provider';
import { Button } from '../../components/ui/button';
import { Plus } from 'lucide-react';
import { AlertTabContext, type AlertTab } from './alert-workspace-tabs';
import { AlertRulesTable } from './alert-rules-table';
import { AlertRuleDialog } from './alert-rules-editor';

export function AlertsWorkspace({
  incidentsContent,
}: {
  incidentsContent: ReactNode;
}) {
  const th = useLocale() === 'th';
  const user = useSessionUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const permitted = user.authorization
    ? user.authorization.permissions.includes('technical.alerts.edit')
    : ['admin', 'operator'].includes(user.role);

  const initialTab: AlertTab =
    searchParams.get('tab') === 'rules' ? 'rules' : 'incidents';

  const [tab, setTab] = useState<AlertTab>(initialTab);
  const [creatingRule, setCreatingRule] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);

  // Sync state when URL searchParams changes
  useEffect(() => {
    const qTab: AlertTab =
      searchParams.get('tab') === 'rules' ? 'rules' : 'incidents';
    setTab(qTab);
  }, [searchParams]);

  const handleTabChange = (nextTab: AlertTab) => {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'rules') {
      params.set('tab', 'rules');
    } else {
      params.delete('tab');
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <AlertTabContext.Provider value={{ tab, setTab: handleTabChange }}>
      {/* Incidents View */}
      <div className={tab === 'incidents' ? 'block' : 'hidden'}>
        {incidentsContent}
      </div>

      {/* Rules View */}
      <div className={tab === 'rules' ? 'block' : 'hidden'}>
        <div className="content min-w-0 max-w-full">
          <div className="ops-content space-y-4">
            {/* Header matching OperationPageHeader structure */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3.5">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                  {th ? 'การแจ้งเตือน' : 'Alerts'}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {th
                    ? 'จัดการกฎ เงื่อนไข และผู้รับการแจ้งเตือนในแต่ละไซต์งาน'
                    : 'Manage alert rules, triggers, and site recipients'}
                </p>
              </div>

              {permitted && (
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Button
                    onClick={() => setCreatingRule(true)}
                    className="font-semibold shadow-xs"
                  >
                    <Plus className="size-4 mr-1.5" />
                    <span>{th ? 'เพิ่มกฎแจ้งเตือน' : 'Add alert rule'}</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Alert Rules Table with search, filters, tabs, and 7 columns */}
            <AlertRulesTable
              key={refreshRevision}
              onAddRuleClick={() => setCreatingRule(true)}
            />

            {/* Standalone Create Rule Dialog triggered from top header button */}
            <AlertRuleDialog
              open={creatingRule}
              onOpenChange={setCreatingRule}
              onSaved={() => setRefreshRevision((r) => r + 1)}
            />
          </div>
        </div>
      </div>
    </AlertTabContext.Provider>
  );
}
