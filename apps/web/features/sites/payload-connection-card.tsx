"use client";

import * as React from 'react';
import { Cpu } from 'lucide-react';
import { useSessionUser } from '../../providers/session-user-provider';
import { gatewayPermissions } from './gateway-permissions';
import { unmappedFields } from './unmapped-fields';
import { apiClient } from '../../lib/api-client';
import { formatAppDateTime } from '../../lib/date-format';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { useLocale } from '../../providers/locale-provider';
import { PresetPicker } from './preset-picker';
import { DeviceFieldsTable } from './device-profile-editor';
import { DeviceFieldRegisterEditor } from './device-field-register-editor';
import type { CadenceData } from './cadence-form-section';
import { draftFromDevice, deviceProfilePayload, validateDeviceDraft, type DeviceDraft } from './site-form-values';
import type { PayloadConfig, PayloadDevice, PayloadRevision } from './payload-contracts';

export function ProfileSelect({
  revisions,
  value,
  onChange,
  label = 'Preset',
  onCatalogChange,
}: {
  revisions: PayloadRevision[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  onCatalogChange?: (rows: PayloadRevision[]) => void;
}) {
  return <PresetPicker revisions={revisions} value={value} onChange={onChange} label={label} {...(onCatalogChange ? { onCatalogChange } : {})} />;
}

function SavedDeviceEditor({
  device,
  revisions,
  onRefresh,
  onCatalogChange,
  config,
  externalDraft,
  onExternalDraftChange,
  hideInlineSave = false,
  showErrors = false,
}: {
  device: PayloadDevice;
  revisions: PayloadRevision[];
  onRefresh: () => void;
  onCatalogChange: (rows: PayloadRevision[]) => void;
  config: PayloadConfig;
  focusBilling?: boolean;
  billingSetupPending?: boolean;
  showAdvanced?: boolean;
  externalDraft?: DeviceDraft | undefined;
  onExternalDraftChange?: ((draft: DeviceDraft) => void) | undefined;
  hideInlineSave?: boolean;
  showErrors?: boolean;
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const permissions = gatewayPermissions(useSessionUser());
  const cadence = (config as unknown as { cadence?: CadenceData[] }).cadence?.find((c) => c.id === device.id);
  const effectiveExpectedIntervalSeconds = cadence?.expectedIntervalSeconds ?? device.expectedIntervalSeconds;

  const [internalDraft, setInternalDraft] = React.useState(() =>
    draftFromDevice(
      typeof effectiveExpectedIntervalSeconds === 'number'
        ? { ...device, expectedIntervalSeconds: effectiveExpectedIntervalSeconds }
        : device
    )
  );
  const draft = externalDraft ?? internalDraft;
  const setDraft = React.useCallback(
    (next: DeviceDraft | ((prev: DeviceDraft) => DeviceDraft)) => {
      if (onExternalDraftChange) {
        const resolved = typeof next === 'function' ? next(draft) : next;
        onExternalDraftChange(resolved);
      } else {
        setInternalDraft(next);
      }
    },
    [draft, onExternalDraftChange]
  );

  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [localShowErrors, setLocalShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (typeof effectiveExpectedIntervalSeconds === 'number' && !onExternalDraftChange) {
      setInternalDraft((prev) =>
        prev.dirty ? prev : { ...prev, expectedIntervalSeconds: effectiveExpectedIntervalSeconds }
      );
    }
  }, [effectiveExpectedIntervalSeconds, onExternalDraftChange]);

  async function save(confirmed = false) {
    if (!permissions.deviceEdit) return;
    setLocalShowErrors(true);
    const problem = validateDeviceDraft(draft, !!device.billingMeter, locale);
    if (problem) {
      setError(problem);
      return;
    }
    if (device.billingMeter && (draft.profileDirty || draft.payloadProfileRevisionId !== device.profileRevisionId) && !confirmed) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.patch<{ payloadProfileRevisionId: string }>(
        `/v1/devices/${device.id}/payload-profile`,
        {
          ...deviceProfilePayload(draft),
          name: draft.name,
          model: draft.model,
          serialNumber: draft.serialNumber,
          expectedIntervalSeconds: draft.expectedIntervalSeconds,
        }
      );
      setConfirm(false);
      setLocalShowErrors(false);
      setDraft({ ...draft, dirty: false, profileDirty: false });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setBusy(false);
    }
  }

  const effectiveShowErrors = showErrors || localShowErrors;
  const problemMessage = effectiveShowErrors ? validateDeviceDraft(draft, !!device.billingMeter, locale) : null;

  return (
    <section
      id={`device-card-${device.id}`}
      className={
        device.billingMeter
          ? `flex min-w-0 flex-col gap-4 ${problemMessage ? 'rounded-xl border border-destructive/60 p-4' : ''}`
          : `flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 ${problemMessage ? 'border-destructive/60' : ''}`
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="size-4 text-primary" />
          <span>{device.name}</span>
        </h3>
        <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border">
          {device.externalDeviceId}
        </span>
      </div>

      <DeviceFieldRegisterEditor
        deviceId={device.id}
        showAdvanced={false}
        showErrors={effectiveShowErrors}
        value={draft}
        onChange={setDraft}
        revisions={revisions}
        onCatalogChange={onCatalogChange}
        locale={locale}
        billing={!!device.billingMeter}
        identityLocked
        {...(device.billingSourceTag ? { billingSourceTag: device.billingSourceTag } : {})}
      />

      {(error || problemMessage) && (
        <p role="alert" data-slot="field-error" className="text-xs text-destructive">
          {error || problemMessage}
        </p>
      )}

      {permissions.deviceEdit && !hideInlineSave && (
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกอุปกรณ์' : 'Save device'}
        </Button>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{th ? 'ยืนยันเปลี่ยนโปรไฟล์มิเตอร์หลัก' : 'Confirm main meter profile change'}</DialogTitle>
            <DialogDescription>
              {th
                ? 'ใช้ Mapping ใหม่กับข้อมูลใหม่เท่านั้น ต้องยืนยันแหล่งข้อมูลบิลอีกครั้งก่อนคำนวณ'
                : 'The new mapping applies to new data. Reconfirm the billing source before calculating a bill.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save(true)}>
              {th ? 'ยืนยัน' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function PayloadConnectionCard({
  config,
  onRefresh,
  editable: requestedEditable = false,
  edgeToEdge = false,
  focusBilling = false,
  billingSetupPending = false,
  drafts,
  onDraftChange,
  hideInlineSave = false,
  showErrors = false,
}: {
  config: PayloadConfig;
  onRefresh: () => void;
  editable?: boolean;
  edgeToEdge?: boolean;
  focusBilling?: boolean;
  billingSetupPending?: boolean;
  showAdvanced?: boolean;
  drafts?: Record<string, DeviceDraft> | undefined;
  onDraftChange?: ((deviceId: string, draft: DeviceDraft) => void) | undefined;
  hideInlineSave?: boolean;
  showErrors?: boolean;
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const permissions = gatewayPermissions(useSessionUser());
  const editable = requestedEditable && permissions.deviceEdit;
  const [revisions, setRevisions] = React.useState<PayloadRevision[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (editable) {
      apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets')
        .then(setRevisions)
        .catch((e: Error) => setError(e.message));
    }
  }, [editable]);

  return (
    <section className={edgeToEdge ? 'flex min-w-0 flex-col gap-5' : 'flex min-w-0 flex-col gap-5 border-t pt-5'}>
      {config.devices.map((device) =>
        editable || permissions.registerView ? (
          <SavedDeviceEditor
            key={`${device.id}-${device.profileRevisionId}`}
            device={device}
            revisions={revisions}
            onRefresh={onRefresh}
            onCatalogChange={setRevisions}
            config={config}
            focusBilling={focusBilling}
            billingSetupPending={billingSetupPending}
            showAdvanced={false}
            externalDraft={drafts?.[device.id]}
            onExternalDraftChange={onDraftChange ? (next) => onDraftChange(device.id, next) : undefined}
            hideInlineSave={hideInlineSave}
            showErrors={showErrors}
          />
        ) : (
          <section key={device.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
            <h3 className="font-semibold text-sm">
              {device.name} · {device.externalDeviceId}
            </h3>
            <DeviceFieldsTable
              fields={device.fields ?? []}
              locale={locale}
              {...(device.billingSourceTag ? { billingSourceTag: device.billingSourceTag } : {})}
            />
          </section>
        )
      )}

      {config.unmappedMessages && config.unmappedMessages.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold text-sm">{th ? 'ฟิลด์ต้นทางที่ยังไม่จับคู่' : 'Unmapped source fields'}</h3>
          <DataTable
            data={config.unmappedMessages.flatMap((m) =>
              unmappedFields(m.unmapped).map((f, i) => ({
                ...f,
                externalDeviceId: m.externalDeviceId ?? '—',
                id: m.messageId + '-' + i,
              }))
            )}
            getRowId={(r) => r.id}
            columns={[
              { accessorKey: 'externalDeviceId', header: th ? 'รหัสอุปกรณ์' : 'Device code' },
              { accessorKey: 'tag', header: th ? 'ชื่อค่า' : 'Tag' },
              { accessorKey: 'rawValue', header: th ? 'ค่าต้นทาง' : 'Raw value' },
              { accessorKey: 'rawUnit', header: th ? 'หน่วยต้นทาง' : 'Raw unit' },
            ]}
          />
        </section>
      )}

      {config.rejections && config.rejections.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-sm">
              {th ? 'ข้อความที่ถูกปฏิเสธการรับข้อมูล' : 'Rejected messages'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {th
                ? 'รายการข้อมูลที่เกตเวย์ส่งมาแต่ระบบปฏิเสธเนื่องจากรูปแบบข้อมูลหรือเวอร์ชันโปรไฟล์ไม่ตรงกับที่ตั้งค่าไว้'
                : 'Messages sent by the gateway that were rejected due to schema or profile version mismatch.'}
            </p>
          </div>
          <DataTable
            data={config.rejections}
            columns={[
              {
                accessorKey: 'receivedAt',
                header: th ? 'เวลารับ' : 'Received',
                cell: ({ row }) => (
                  <span className="whitespace-nowrap tabular-nums text-xs">
                    {formatAppDateTime(row.original.receivedAt, locale)}
                  </span>
                ),
              },
              { accessorKey: 'topic', header: 'Topic' },
              { accessorKey: 'reason', header: th ? 'เหตุผล' : 'Reason' },
            ]}
          />
        </section>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
