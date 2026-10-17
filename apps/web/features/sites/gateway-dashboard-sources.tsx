'use client';

import { useEffect, useState } from 'react';
import { useSessionUser } from '../../providers/session-user-provider';
import { useLocale } from '../../providers/locale-provider';
import { apiClient } from '../../lib/api-client';
import { gatewayPermissions } from './gateway-permissions';
import { metricSourceOptions, type MetricSources, type DashboardMetric, type MetricSource } from './dashboard-source-model';
import type { PayloadDevice } from './payload-contracts';
import { Label } from '../../components/ui/label';
import { ChoiceSelect } from '../../components/ui/choice-select';
import { Button } from '../../components/ui/button';

export function GatewayDashboardSources({
  gatewayId,
  devices,
  sources,
  onSaved,
}: {
  gatewayId: string;
  devices: PayloadDevice[];
  sources: MetricSources;
  onSaved: () => void;
}) {
  const th = useLocale() === 'th';
  const permissions = gatewayPermissions(useSessionUser());
  const [draft, setDraft] = useState<Record<DashboardMetric, MetricSource | null>>({
    energy: sources.energy ?? null,
    power: sources.power ?? null,
  });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft({ energy: sources.energy ?? null, power: sources.power ?? null });
    setPreview(false);
  }, [sources.energy?.deviceId, sources.energy?.tag, sources.power?.deviceId, sources.power?.tag]);

  const label = (metric: DashboardMetric, source: MetricSource | null | undefined) =>
    source
      ? metricSourceOptions(metric, devices).find(
          (option) => option.source.deviceId === source.deviceId && option.source.tag === source.tag
        )?.label ?? `${source.deviceId} · ${source.tag}`
      : th
      ? 'Logger ที่ตรงกันเพียงหนึ่งตัว'
      : 'Unique matching Logger default';

  async function save() {
    if (!permissions.gatewayEdit || !preview) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.patch(`/v1/gateways/${gatewayId}/dashboard-sources`, {
        impactConfirmed: true,
        sources: draft,
      });
      setPreview(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{th ? 'แหล่งข้อมูลการผลิตไฟฟ้า' : 'Production measurement sources'}</h3>
        <p className="text-xs text-muted-foreground">
          {th
            ? 'แยกแหล่งพลังงานและกำลัง หากใช้ค่าตั้งต้นต้องมี Logger ที่ตรงกันเพียงหนึ่งตัว'
            : 'Energy and power use separate sources. Defaults require one matching Logger.'}
        </p>
      </div>

      <div className="space-y-3.5">
        {(['energy', 'power'] as const).map((metric) => (
          <div key={metric} className="space-y-1.5">
            <Label htmlFor={`dashboard-source-${metric}`} className="text-xs font-medium text-foreground">
              {metric === 'energy'
                ? th
                  ? 'แหล่งพลังงานผลิต'
                  : 'Production energy source'
                : th
                ? 'แหล่งกำลังผลิต'
                : 'Production power source'}
            </Label>
            <ChoiceSelect
              id={`dashboard-source-${metric}`}
              disabled={!permissions.gatewayEdit || busy}
              value={draft[metric] ? draft[metric]!.deviceId + '|' + draft[metric]!.tag : ''}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  [metric]:
                    metricSourceOptions(metric, devices).find((option) => option.value === e.target.value)?.source ?? null,
                });
                setPreview(false);
              }}
              className="w-full text-xs"
            >
              <option value="">{th ? 'ค่าตั้งต้น Logger' : 'Default Logger'}</option>
              {metricSourceOptions(metric, devices).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ChoiceSelect>
          </div>
        ))}
      </div>

      {permissions.gatewayEdit && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPreview(true)}>
          {th ? 'ตรวจการเปลี่ยนแหล่งข้อมูล' : 'Preview source changes'}
        </Button>
      )}

      {preview && permissions.gatewayEdit && (
        <div className="space-y-3 rounded-lg bg-muted/40 border p-3">
          <h4 className="text-xs font-semibold">{th ? 'ยืนยันแหล่งข้อมูลเดิมและใหม่' : 'Confirm previous and new sources'}</h4>
          {(['energy', 'power'] as const).map((metric) => (
            <p key={metric} className="text-xs">
              <span className="font-medium">{metric === 'energy' ? (th ? 'พลังงาน' : 'Energy') : th ? 'กำลัง' : 'Power'}:</span>{' '}
              {label(metric, sources[metric])} → {label(metric, draft[metric])}
            </p>
          ))}
          <Button disabled={busy} size="sm" type="button" onClick={() => void save()}>
            {th ? 'ยืนยันและบันทึกแหล่งข้อมูล' : 'Confirm and save sources'}
          </Button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
