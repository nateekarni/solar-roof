'use client';

import { ChoiceSelect } from '../../components/ui/choice-select';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../../lib/api-client';
import { useSessionUser } from '../../providers/session-user-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Settings } from 'lucide-react';
import { alertRuleState } from './alert-rule-state';
import { useLocale } from '../../providers/locale-provider';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getRuleSiteIds, type AlertRule, type AlertSite, type AlertRecipient } from './alert-rules-model';
import { notify } from '../../components/feedback/notifications';

export type { AlertRule, AlertSite, AlertRecipient };

const selectClass = 'rounded-md border border-input bg-white dark:bg-card p-2 text-sm w-full';
const inputClass = 'bg-white dark:bg-card';

const RuleSettingsContext = createContext<{
  open: () => void;
  state: string;
  error: string;
  permitted: boolean;
} | null>(null);

export function AlertRuleSettingsButton() {
  const settings = useContext(RuleSettingsContext);
  const th = useLocale() === 'th';
  if (!settings?.permitted) return null;
  return (
    <Button variant="outline" onClick={settings.open}>
      <Settings className="size-4" />
      {th ? 'ตั้งค่าการแจ้งเตือน' : 'Alert settings'}
    </Button>
  );
}

export function AlertRuleEmptyState() {
  const settings = useContext(RuleSettingsContext);
  const th = useLocale() === 'th';
  if (!settings?.permitted) return null;
  if (settings.error) return <p role="alert" className="text-destructive">{settings.error}</p>;
  if (!['unconfigured', 'disabled'].includes(settings.state)) return null;
  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <h2 className="font-semibold">
        {settings.state === 'unconfigured'
          ? th
            ? 'ยังไม่ได้ตั้งค่ากฎแจ้งเตือน'
            : 'No alert rules configured'
          : th
          ? 'กฎแจ้งเตือนทั้งหมดปิดใช้งาน'
          : 'All alert rules are disabled'}
      </h2>
      <p className="text-sm text-muted-foreground">
        {th
          ? 'จัดการเงื่อนไขและผู้รับในหน้ารายการกฎการแจ้งเตือน'
          : 'Manage conditions and recipients in alert rules.'}
      </p>
      <Button variant="outline" onClick={settings.open}>
        {th ? 'ตั้งค่ากฎแจ้งเตือน' : 'Configure alert rules'}
      </Button>
    </section>
  );
}

export function AlertRuleDialog({
  open,
  onOpenChange,
  initialRule,
  onSaved,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRule?: AlertRule | null;
  onSaved?: () => void;
  inline?: boolean;
}) {
  const th = useLocale() === 'th';
  const isEditing = Boolean(initialRule);

  const [sites, setSites] = useState<AlertSite[]>([]);
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);

  const initialSiteIds = getRuleSiteIds(initialRule);
  const [siteId, setSiteId] = useState(initialSiteIds[0] ?? initialRule?.site_id ?? '');
  const [siteIds, setSiteIds] = useState<string[]>(initialSiteIds);
  const [kind, setKind] = useState<string>(initialRule?.kind ?? 'offline');
  const [field, setField] = useState(initialRule?.semantic_field ?? 'active_power');
  const [operator, setOperator] = useState(initialRule?.operator ?? 'gt');
  const [threshold, setThreshold] = useState(
    initialRule?.threshold !== undefined && initialRule?.threshold !== null
      ? String(initialRule.threshold)
      : ''
  );
  const [duration, setDuration] = useState(String(initialRule?.duration_seconds ?? 120));
  const [cooldown, setCooldown] = useState(String(initialRule?.cooldown_seconds ?? 300));
  const [recovery, setRecovery] = useState(Boolean(initialRule?.recovery));
  const [selected, setSelected] = useState<string[]>(initialRule?.recipient_user_ids ?? []);
  const [channels, setChannels] = useState<string[]>(initialRule?.channels ?? ['in_app']);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Sync state when initialRule or open changes
  useEffect(() => {
    if (open) {
      const nextSiteIds = getRuleSiteIds(initialRule);
      setError('');
      setSiteId(nextSiteIds[0] ?? initialRule?.site_id ?? '');
      setSiteIds(nextSiteIds);
      setKind(initialRule?.kind ?? 'offline');
      setField(initialRule?.semantic_field ?? 'active_power');
      setOperator(initialRule?.operator ?? 'gt');
      setThreshold(
        initialRule?.threshold !== undefined && initialRule?.threshold !== null
          ? String(initialRule.threshold)
          : ''
      );
      setDuration(String(initialRule?.duration_seconds ?? 120));
      setCooldown(String(initialRule?.cooldown_seconds ?? 300));
      setRecovery(Boolean(initialRule?.recovery));
      setSelected(initialRule?.recipient_user_ids ?? []);
      setChannels(initialRule?.channels ?? ['in_app']);
    }
  }, [open, initialRule]);

  // Load sites once
  useEffect(() => {
    if (!open) return;
    let active = true;
    apiClient
      .get<AlertSite[]>('/v1/alert-rules/sites')
      .then((s) => {
        if (active) setSites(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open]);

  const effectiveSiteIds = siteIds.length > 0 ? siteIds : siteId ? [siteId] : [];
  const siteQueryKey = effectiveSiteIds.join(',');

  // Load recipients when selected sites change
  useEffect(() => {
    if (!open || !siteQueryKey) {
      setRecipients([]);
      return;
    }
    let active = true;
    apiClient
      .get<AlertRecipient[]>(`/v1/alert-rules/recipients?site_id=${encodeURIComponent(siteQueryKey)}`)
      .then((r) => {
        if (active) setRecipients(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, siteQueryKey]);

  const toggle = (values: string[], value: string) =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

  const handlePrimarySiteChange = (nextId: string) => {
    setSiteId(nextId);
    if (!nextId) {
      setSiteIds([]);
    } else if (!siteIds.includes(nextId)) {
      setSiteIds((prev) => (prev.length === 0 ? [nextId] : [nextId, ...prev.filter((id) => id !== nextId)]));
    }
  };

  const handleToggleSite = (targetId: string) => {
    const next = toggle(effectiveSiteIds, targetId);
    setSiteIds(next);
    setSiteId(next[0] ?? '');
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      const targetSites = effectiveSiteIds;
      if (isEditing && initialRule) {
        await apiClient.patch(`/v1/alert-rules/${initialRule.id}`, {
          siteId: targetSites[0],
          siteIds: targetSites,
          kind,
          semanticField: kind === 'threshold' ? field : undefined,
          operator: kind === 'threshold' ? operator : undefined,
          threshold: kind === 'threshold' ? Number(threshold) : undefined,
          durationSeconds: Number(duration),
          cooldownSeconds: Number(cooldown),
          recovery,
          recipientUserIds: selected,
          channels,
        });
        notify.success(th ? 'แก้ไขกฎแจ้งเตือนสำเร็จ' : 'Alert rule updated');
      } else {
        await apiClient.post('/v1/alert-rules', {
          siteId: targetSites[0],
          siteIds: targetSites,
          kind,
          semanticField: kind === 'threshold' ? field : undefined,
          operator: kind === 'threshold' ? operator : undefined,
          threshold: kind === 'threshold' ? Number(threshold) : undefined,
          durationSeconds: Number(duration),
          cooldownSeconds: Number(cooldown),
          recovery,
          recipientUserIds: selected,
          channels,
        });
        notify.success(th ? 'เพิ่มกฎแจ้งเตือนสำเร็จ' : 'Alert rule created');
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dialogBody = (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEditing
            ? th
              ? 'แก้ไขกฎการแจ้งเตือน'
              : 'Edit alert rule'
            : th
            ? 'เพิ่มกฎการแจ้งเตือน'
            : 'Add alert rule'}
        </DialogTitle>
        <DialogDescription>
          {th
            ? 'จัดการกฎ เงื่อนไข และผู้รับการแจ้งเตือน'
            : 'Manage rules, conditions, and recipients'}
        </DialogDescription>
      </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {th
            ? 'เลือกผู้รับที่ยืนยันอีเมลและมีสิทธิ์ไซต์ การเปิดอ่านไม่เป็นการรับทราบเหตุแจ้งเตือน'
            : 'Choose verified recipients with current site access. Reading does not acknowledge an alarm.'}
        </p>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="grid gap-4 md:grid-cols-2"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="rule-site">{th ? 'ไซต์งาน' : 'Site'}</Label>
              {effectiveSiteIds.length > 0 && (
                <span className="text-xs font-medium text-primary">
                  {effectiveSiteIds.length} {th ? 'ไซต์' : 'sites'}
                </span>
              )}
            </div>
            <ChoiceSelect
              id="rule-site"
              className={selectClass}
              required={!effectiveSiteIds.length}
              disabled={isEditing}
              value={siteId}
              onChange={(e) => handlePrimarySiteChange(e.target.value)}
            >
              <option value="">{th ? 'เลือกไซต์' : 'Select site'}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.code}
                </option>
              ))}
            </ChoiceSelect>
            {sites.length > 1 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border bg-muted/20 p-2 space-y-1.5">
                {sites.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={effectiveSiteIds.includes(s.id)}
                      onChange={() => handleToggleSite(s.id)}
                    />
                    <span className="truncate">{s.name} · {s.code}</span>
                  </label>
                ))}
              </div>
            )}
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                {th
                  ? 'ไม่สามารถเปลี่ยนไซต์งานได้เนื่องจากผู้รับถูกผูกกับสิทธิ์ไซต์'
                  : 'Site cannot be changed because recipients are tied to site permissions'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-kind">{th ? 'เงื่อนไข' : 'Condition'}</Label>
            <ChoiceSelect
              id="rule-kind"
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="offline">{th ? 'เกตเวย์ออฟไลน์' : 'Gateway offline'}</option>
              <option value="stale">{th ? 'ข้อมูลเก่า' : 'Stale telemetry'}</option>
              <option value="threshold">{th ? 'เกณฑ์ข้อมูล' : 'Value threshold'}</option>
            </ChoiceSelect>
          </div>

          {kind === 'threshold' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="rule-field">{th ? 'ค่าข้อมูล' : 'Field'}</Label>
                <ChoiceSelect
                  id="rule-field"
                  className={selectClass}
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                >
                  {[
                    ['active_power', th ? 'กำลังไฟ (W)' : 'Power (W)'],
                    ['total_energy', th ? 'พลังงาน (kWh)' : 'Energy (kWh)'],
                    ['voltage', th ? 'แรงดัน (V)' : 'Voltage (V)'],
                    ['current', th ? 'กระแส (A)' : 'Current (A)'],
                    ['frequency', th ? 'ความถี่ (Hz)' : 'Frequency (Hz)'],
                    ['power_factor', 'Power factor'],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </ChoiceSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rule-threshold">{th ? 'เกณฑ์' : 'Threshold'}</Label>
                <div className="flex gap-2">
                  <ChoiceSelect
                    aria-label={th ? 'ตัวเปรียบเทียบ' : 'Operator'}
                    className={selectClass}
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                  >
                    {['gt', 'gte', 'lt', 'lte'].map((v, i) => (
                      <option key={v} value={v}>
                        {['>', '≥', '<', '≤'][i]}
                      </option>
                    ))}
                  </ChoiceSelect>
                  <Input
                    id="rule-threshold"
                    className={inputClass}
                    required
                    type="number"
                    step="any"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-duration">
              {th ? 'เกิดเงื่อนไขต่อเนื่อง (วินาที)' : 'Duration (seconds)'}
            </Label>
            <Input
              id="rule-duration"
              className={inputClass}
              required
              type="number"
              min="0"
              max="604800"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-cooldown">
              {th ? 'ระยะพัก (วินาที)' : 'Cooldown (seconds)'}
            </Label>
            <Input
              id="rule-cooldown"
              className={inputClass}
              required
              type="number"
              min="0"
              max="2592000"
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">{th ? 'ผู้รับ' : 'Recipients'}</legend>
            {recipients.length ? (
              recipients.map((r) => (
                <label key={r.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => setSelected(toggle(selected, r.id))}
                  />
                  <span>
                    {r.name} · {r.email}
                  </span>
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {th ? 'ไม่มีผู้รับที่ยืนยันในไซต์' : 'No verified site recipients'}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">{th ? 'ช่องทาง' : 'Channels'}</legend>
            {[
              ['in_app', th ? 'ในระบบ' : 'In app'],
              ['email', th ? 'อีเมล' : 'Email'],
            ].map(([v, l]) => (
              <label key={v} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channels.includes(v!)}
                  onChange={() => setChannels(toggle(channels, v!))}
                />
                {l}
              </label>
            ))}
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={recovery}
                onChange={(e) => setRecovery(e.target.checked)}
              />
              {th ? 'แจ้งเมื่อกลับสู่ปกติ' : 'Recovery notification'}
            </label>
          </fieldset>

          <div className="flex justify-end gap-2 pt-4 md:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={busy || !effectiveSiteIds.length || !selected.length || !channels.length}
            >
              {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกกฎ' : 'Save rule'}
            </Button>
          </div>
        </form>
    </>
  );

  if (inline) {
    return (
      <Dialog open={true}>
        <section className="sm:max-w-3xl p-4 space-y-4">{dialogBody}</section>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-sm:w-full max-sm:max-h-[90svh] max-h-[90vh] overflow-y-auto space-y-4">
        {dialogBody}
      </DialogContent>
    </Dialog>
  );
}

export function AlertRulesEditor({
  children,
  onRuleUpdated,
}: {
  children?: ReactNode;
  onRuleUpdated?: () => void;
}) {
  const user = useSessionUser();
  const permitted = user.authorization
    ? user.authorization.permissions.includes('technical.alerts.edit')
    : ['admin', 'operator'].includes(user.role);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    setLoaded(false);
    setError('');
    apiClient
      .get<AlertRule[]>('/v1/alert-rules')
      .then((r) => {
        if (active) {
          setRules(r);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [permitted]);

  if (!permitted) return <>{children}</>;

  const refreshRules = async () => {
    try {
      const updated = await apiClient.get<AlertRule[]>('/v1/alert-rules');
      setRules(updated);
      onRuleUpdated?.();
    } catch {
      // Ignored
    }
  };

  return (
    <RuleSettingsContext.Provider
      value={{
        open: () => setOpen(true),
        state: alertRuleState(loaded, rules),
        error,
        permitted,
      }}
    >
      {children}
      <AlertRuleDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={refreshRules}
      />
    </RuleSettingsContext.Provider>
  );
}
