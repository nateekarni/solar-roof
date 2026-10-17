'use client';

import { createContext, useContext, useId } from 'react';
import { useLocale } from '../../providers/locale-provider';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type AlertTab = 'incidents' | 'rules';

export const AlertTabContext = createContext<{
  tab: AlertTab;
  setTab: (tab: AlertTab) => void;
} | null>(null);

export function useAlertTab() {
  return useContext(AlertTabContext);
}

export function AlertWorkspaceTabs({
  value,
  onValueChange,
  className,
}: {
  value?: AlertTab;
  onValueChange?: (val: AlertTab) => void;
  className?: string;
}) {
  const th = useLocale() === 'th';
  const ctx = useAlertTab();

  let router: ReturnType<typeof useRouter> | null = null;
  let searchParams: ReturnType<typeof useSearchParams> | null = null;
  let pathname = '';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    searchParams = useSearchParams();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = usePathname();
  } catch {
    // Graceful fallback when outside App Router (e.g. static tests)
  }

  const currentTab: AlertTab =
    value ??
    ctx?.tab ??
    (searchParams?.get('tab') === 'rules' ? 'rules' : 'incidents');

  const handleValueChange = (nextValue: string) => {
    const nextTab = nextValue as AlertTab;
    if (onValueChange) {
      onValueChange(nextTab);
      return;
    }
    if (ctx) {
      ctx.setTab(nextTab);
      return;
    }
    if (!router || !searchParams) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'rules') {
      params.set('tab', 'rules');
    } else {
      params.delete('tab');
    }
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const triggerClass =
    'shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-neutral-950 data-[state=active]:font-bold data-active:border-primary data-active:bg-primary data-active:text-neutral-950 data-active:font-bold transition-colors shadow-none cursor-pointer';

  return (
    <Tabs
      value={currentTab}
      onValueChange={handleValueChange}
      className={className ?? 'min-w-0'}
    >
      <TabsList
        aria-label={th ? 'เลือกแท็บการแจ้งเตือน' : 'Alert workspace tabs'}
        className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none"
      >
        <TabsTrigger value="incidents" className={triggerClass}>
          {th ? 'รายการแจ้งเตือน' : 'Alert incidents'}
        </TabsTrigger>
        <TabsTrigger value="rules" className={triggerClass}>
          {th ? 'รายการกฎการแจ้งเตือน' : 'Alert rules'}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
