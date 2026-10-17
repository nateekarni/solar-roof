'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLocale } from '../../providers/locale-provider';
import { useSessionUser } from '../../providers/session-user-provider';
import { apiClient } from '../../lib/api-client';
import { notify } from '../../components/feedback/notifications';
import { DataTable } from '../../components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { SearchInput } from '../../components/ui/search-input';
import { ChoiceSelect } from '../../components/ui/choice-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../../components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { MoreHorizontal, Plus, Bell, ShieldAlert, Users, Clock, Database, Building2 } from 'lucide-react';
import { AlertWorkspaceTabs } from './alert-workspace-tabs';
import { AlertRuleDialog } from './alert-rules-editor';
import {
  filterAlertRules,
  formatConditionLabel,
  formatDurationCooldown,
  getRuleSiteIds,
  summarizeAlertRules,
  type AlertRule,
  type AlertSite,
} from './alert-rules-model';

export function AlertRuleSiteScopeBadge({
  siteNames,
  th = true,
  inline = false,
  open,
}: {
  siteNames: string[];
  th?: boolean;
  inline?: boolean;
  open?: boolean;
}) {
  if (siteNames.length === 0) {
    return <span className="text-muted-foreground">0</span>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip {...(open !== undefined ? { open } : {})}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="shrink-0 text-xs px-2 py-0.5 font-medium cursor-pointer rounded-full bg-primary/10 text-primary border-primary/25 hover:bg-primary/20 transition-colors"
          >
            {siteNames.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent
          variant="popover"
          side="top"
          align="center"
          inline={inline}
          className="w-72 max-w-xs p-3 shadow-xl border border-border"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/80">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Building2 className="size-4 text-primary shrink-0" />
                <span>{th ? 'ขอบเขตไซต์งาน' : 'Assigned Sites'}</span>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {siteNames.length} {th ? 'ไซต์' : 'sites'}
              </span>
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
              {siteNames.map((name, i) => (
                <li key={i} className="flex items-center gap-2 text-foreground/90 hover:text-foreground">
                  <span className="size-1.5 rounded-full bg-primary shrink-0" />
                  <span className="truncate" title={name}>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AlertRulesTable({
  onAddRuleClick,
}: {
  onAddRuleClick?: () => void;
}) {
  const th = useLocale() === 'th';
  const user = useSessionUser();
  const permitted = user.authorization
    ? user.authorization.permissions.includes('technical.alerts.edit')
    : ['admin', 'operator'].includes(user.role);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [sites, setSites] = useState<AlertSite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Interactive states
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async () => {
    setError('');
    try {
      const [r, s] = await Promise.all([
        apiClient.get<AlertRule[]>('/v1/alert-rules'),
        apiClient.get<AlertSite[]>('/v1/alert-rules/sites'),
      ]);
      setRules(r);
      setSites(s);
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const filtered = useMemo(
    () => filterAlertRules(rules, sites, search, siteFilter, kindFilter, statusFilter),
    [rules, sites, search, siteFilter, kindFilter, statusFilter]
  );

  const summary = useMemo(() => summarizeAlertRules(rules), [rules]);

  const emptyContent = useMemo(() => {
    if (!loaded) return null;
    if (!rules.length) {
      return (
        <Empty className="sticky left-0 gap-1 border-0 bg-transparent py-8" style={{ width: 'calc(100cqw - 1rem)' }}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>
              {th ? 'ยังไม่มีการตั้งค่ากฎแจ้งเตือน' : 'No alert rules configured'}
            </EmptyTitle>
            <EmptyDescription>
              {th
                ? 'สร้างกฎแจ้งเตือนเพื่อรับการแจ้งเตือนเมื่อเกิดความผิดปกติในไซต์งาน'
                : 'Create alert rules to receive notifications when anomalies occur.'}
            </EmptyDescription>
            {permitted && (
              <div className="pt-2">
                <Button
                  onClick={() => {
                    if (onAddRuleClick) {
                      onAddRuleClick();
                    } else {
                      setEditingRule(null);
                      setEditorOpen(true);
                    }
                  }}
                >
                  <Plus className="size-4 mr-1.5" />
                  {th ? 'เพิ่มกฎแจ้งเตือน' : 'Add alert rule'}
                </Button>
              </div>
            )}
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Empty className="sticky left-0 gap-1 border-0 bg-transparent py-8" style={{ width: 'calc(100cqw - 1rem)' }}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Database className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{th ? 'ไม่พบข้อมูล' : 'No results'}</EmptyTitle>
          <EmptyDescription>
            {th
              ? 'ไม่พบกฎการแจ้งเตือนที่ตรงกับเงื่อนไขการค้นหา'
              : 'No alert rules match the search criteria'}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }, [loaded, rules.length, th, permitted, onAddRuleClick]);

  // Handle Switch Toggle
  const handleToggle = async (rule: AlertRule, nextEnabled: boolean) => {
    if (!permitted) return;
    setBusyIds((prev) => [...prev, rule.id]);
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, enabled: nextEnabled } : r))
    );
    try {
      await apiClient.patch(`/v1/alert-rules/${rule.id}`, { enabled: nextEnabled });
      notify.success(
        th
          ? nextEnabled
            ? 'เปิดใช้งานกฎแจ้งเตือนแล้ว'
            : 'ปิดใช้งานกฎแจ้งเตือนแล้ว'
          : nextEnabled
          ? 'Rule enabled'
          : 'Rule disabled'
      );
    } catch (err: any) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !nextEnabled } : r))
      );
      notify.error(
        err.message ||
          (th ? 'ไม่สามารถเปลี่ยนสถานะกฎได้' : 'Failed to update rule status')
      );
    } finally {
      setBusyIds((prev) => prev.filter((id) => id !== rule.id));
    }
  };

  // Handle Delete
  const handleDelete = async (rule: AlertRule) => {
    setDeleting(true);
    try {
      await apiClient.delete(`/v1/alert-rules/${rule.id}`);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      notify.success(th ? 'ลบกฎการแจ้งเตือนแล้ว' : 'Alert rule deleted');
      setDeletingRule(null);
    } catch (err: any) {
      notify.error(err.message || (th ? 'ไม่สามารถลบกฎได้' : 'Failed to delete rule'));
    } finally {
      setDeleting(false);
    }
  };

  // 7 Columns Definition
  const columns: ColumnDef<AlertRule>[] = [
    {
      id: 'condition',
      header: th ? 'เงื่อนไข' : 'Condition',
      cell: ({ row }) => {
        const rule = row.original;
        if (rule.kind === 'offline') {
          return (
            <Badge variant="destructive" className="font-medium">
              {th ? 'เกตเวย์ออฟไลน์' : 'Gateway offline'}
            </Badge>
          );
        }
        if (rule.kind === 'stale') {
          return (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30 font-medium"
            >
              {th ? 'ข้อมูลเก่า' : 'Stale telemetry'}
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="bg-muted/30 font-medium">
            {formatConditionLabel(rule, th ? 'th' : 'en')}
          </Badge>
        );
      },
    },
    {
      id: 'site',
      header: th ? 'ไซต์' : 'Sites',
      accessorFn: (r) => getRuleSiteIds(r).length,
      cell: ({ row }) => {
        const siteIds = getRuleSiteIds(row.original);
        const siteNames = siteIds.map((id) => siteMap.get(id)?.name ?? id);
        return <AlertRuleSiteScopeBadge siteNames={siteNames} th={th} />;
      },
    },
    {
      id: 'duration',
      header: th ? 'การตรวจจับและระยะพัก' : 'Duration & Cooldown',
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            <span className="font-medium text-foreground">{rule.duration_seconds}s</span>
            {' '}{th ? 'ต่อเนื่อง' : 'dur'}{' / '}
            <span className="font-medium text-foreground">{rule.cooldown_seconds}s</span>
            {' '}{th ? 'พัก' : 'cool'}
          </div>
        );
      },
    },
    {
      id: 'channels',
      header: th ? 'ช่องทาง' : 'Channels',
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {rule.channels.includes('in_app') && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {th ? 'ในระบบ' : 'In-app'}
              </Badge>
            )}
            {rule.channels.includes('email') && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {th ? 'อีเมล' : 'Email'}
              </Badge>
            )}
            {rule.recovery && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              >
                {th ? '+ กลับสู่ปกติ' : '+ Recovery'}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'recipients',
      header: th ? 'ผู้รับ' : 'Recipients',
      cell: ({ row }) => {
        const count = row.original.recipient_user_ids.length;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="size-3.5" />
            <span className="font-medium text-foreground">{count}</span> {th ? 'คน' : 'recipients'}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: th ? 'สถานะ' : 'Status',
      cell: ({ row }) => {
        const rule = row.original;
        const isBusy = busyIds.includes(rule.id);
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={rule.enabled}
              disabled={isBusy || !permitted}
              onCheckedChange={(checked) => void handleToggle(rule, checked)}
              aria-label={
                (th ? 'สถานะกฎ ' : 'Rule status ') +
                (siteMap.get(rule.site_id)?.name ?? rule.id)
              }
            />
            <span className="text-xs text-muted-foreground">
              {rule.enabled ? (th ? 'เปิด' : 'Active') : th ? 'ปิด' : 'Disabled'}
            </span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const rule = row.original;
        if (!permitted) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  (th ? 'การจัดการกฎ: ' : 'Rule actions: ') +
                  (siteMap.get(rule.site_id)?.name ?? rule.id)
                }
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditingRule(rule);
                  setEditorOpen(true);
                }}
              >
                {th ? 'แก้ไขกฎ' : 'Edit rule'}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeletingRule(rule)}
              >
                {th ? 'ลบกฎ' : 'Delete rule'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {/* Toolbar: Row 1 (Search & Filters), Row 2 (Tabs) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput
            className="w-full sm:max-w-xs"
            aria-label={th ? 'ค้นหากฎหรือไซต์' : 'Search rules or sites'}
            placeholder={th ? 'ค้นหากฎหรือไซต์…' : 'Search rules or sites…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {/* Site Filter */}
            <ChoiceSelect
              className="w-[180px] max-w-full"
              aria-label={th ? 'ไซต์งาน' : 'Site'}
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
            >
              <option value="all">{th ? 'ทุกไซต์งาน' : 'All sites'}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.code}
                </option>
              ))}
            </ChoiceSelect>

            {/* Condition Kind Filter */}
            <ChoiceSelect
              className="w-[160px] max-w-full"
              aria-label={th ? 'เงื่อนไข' : 'Condition'}
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="all">{th ? 'ทุกเงื่อนไข' : 'All conditions'}</option>
              <option value="offline">{th ? 'เกตเวย์ออฟไลน์' : 'Gateway offline'}</option>
              <option value="stale">{th ? 'ข้อมูลเก่า' : 'Stale telemetry'}</option>
              <option value="threshold">{th ? 'เกณฑ์ข้อมูล' : 'Value threshold'}</option>
            </ChoiceSelect>

            {/* Status Filter */}
            <ChoiceSelect
              className="w-[140px] max-w-full"
              aria-label={th ? 'สถานะ' : 'Status'}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">{th ? 'ทุกสถานะ' : 'All statuses'}</option>
              <option value="enabled">{th ? 'เปิดใช้งาน' : 'Enabled'}</option>
              <option value="disabled">{th ? 'ปิดใช้งาน' : 'Disabled'}</option>
            </ChoiceSelect>
          </div>
        </div>

        {/* Tab Buttons right below the Search Box */}
        <AlertWorkspaceTabs value="rules" />
      </div>

      {/* Summary stats line */}
      {loaded && rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-1">
          <span className="font-medium text-foreground">
            {th ? `ทั้งหมด ${summary.total} กฎ` : `Total ${summary.total} rules`}
          </span>
          <span>•</span>
          <span>
            {th
              ? `ครอบคลุม ${summary.sitesCount} ไซต์งาน`
              : `Covers ${summary.sitesCount} sites`}
          </span>
          <span>•</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
            {th ? `เปิดใช้งาน ${summary.active} กฎ` : `${summary.active} active`}
          </span>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
          hideSearch
          emptyContent={emptyContent}
        />
      </div>

      {/* Mobile Card Layout */}
      <div className="space-y-3 md:hidden">
        {filtered.length ? (
          filtered.map((rule) => {
            const site = siteMap.get(rule.site_id);
            const isBusy = busyIds.includes(rule.id);
            return (
              <article
                key={rule.id}
                className="rounded-xl border bg-card p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="font-medium text-foreground">
                      {site?.name ?? rule.site_id}
                    </h3>
                    {site?.code && (
                      <p className="text-xs text-muted-foreground">{site.code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      disabled={isBusy || !permitted}
                      onCheckedChange={(checked) => void handleToggle(rule, checked)}
                      aria-label={
                        (th ? 'สถานะกฎ ' : 'Rule status ') + (site?.name ?? rule.id)
                      }
                    />
                    {permitted && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={
                              (th ? 'การจัดการกฎ: ' : 'Rule actions: ') +
                              (site?.name ?? rule.id)
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditingRule(rule);
                              setEditorOpen(true);
                            }}
                          >
                            {th ? 'แก้ไขกฎ' : 'Edit rule'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeletingRule(rule)}
                          >
                            {th ? 'ลบกฎ' : 'Delete rule'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {rule.kind === 'offline' && (
                    <Badge variant="destructive" className="font-medium">
                      {th ? 'เกตเวย์ออฟไลน์' : 'Gateway offline'}
                    </Badge>
                  )}
                  {rule.kind === 'stale' && (
                    <Badge
                      variant="secondary"
                      className="bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30 font-medium"
                    >
                      {th ? 'ข้อมูลเก่า' : 'Stale telemetry'}
                    </Badge>
                  )}
                  {rule.kind === 'threshold' && (
                    <Badge variant="outline" className="bg-muted/30 font-medium">
                      {formatConditionLabel(rule, th ? 'th' : 'en')}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {rule.duration_seconds}s / {rule.cooldown_seconds}s
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" />
                    {rule.recipient_user_ids.length} {th ? 'ผู้รับ' : 'recipients'}
                  </span>
                </div>
              </article>
            );
          })
        ) : (
          emptyContent
        )}
      </div>

      {/* Create / Edit Rule Dialog */}
      <AlertRuleDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingRule(null);
        }}
        initialRule={editingRule}
        onSaved={loadData}
      />

      {/* Delete Rule Confirmation Dialog */}
      {deletingRule && (
        <Dialog
          open={Boolean(deletingRule)}
          onOpenChange={(open) => !open && setDeletingRule(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {th ? 'ยืนยันลบกฎการแจ้งเตือน' : 'Confirm rule deletion'}
              </DialogTitle>
              <DialogDescription>
                {th
                  ? 'คุณต้องการลบกฎการแจ้งเตือนนี้หรือไม่ เมื่อลบแล้วระบบจะไม่ส่งการแจ้งเตือนตามเงื่อนไขนี้อีกต่อไป'
                  : 'Are you sure you want to delete this alert rule? Once deleted, alerts will no longer trigger for this condition.'}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 text-sm space-y-1">
              <p className="font-semibold text-foreground">
                {siteMap.get(deletingRule.site_id)?.name ?? deletingRule.site_id}
              </p>
              <p className="text-muted-foreground">
                {formatConditionLabel(deletingRule, th ? 'th' : 'en')} ·{' '}
                {formatDurationCooldown(
                  deletingRule.duration_seconds,
                  deletingRule.cooldown_seconds,
                  th ? 'th' : 'en'
                )}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeletingRule(null)}
              >
                {th ? 'ยกเลิก' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void handleDelete(deletingRule)}
              >
                {deleting
                  ? th
                    ? 'กำลังลบ…'
                    : 'Deleting…'
                  : th
                  ? 'ยืนยันลบกฎ'
                  : 'Delete rule'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
