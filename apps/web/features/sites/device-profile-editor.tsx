"use client";
import * as React from 'react';
import {Plus, Trash2, List, Pencil} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {Textarea} from '../../components/ui/textarea';
import {Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription} from '../../components/ui/empty';
import {Badge} from '../../components/ui/badge';
import {Field, FieldError, FieldGroup, FieldLabel} from '../../components/ui/field';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from '../../components/ui/dialog';
import {Table, TableHeader, TableHead, TableRow, TableBody, TableCell} from '../../components/ui/table';
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from '../../components/ui/select';
import {sourceUnits, compatibleUnits, derivedConversion} from '@solar/api-contracts/unit-conversion';
import {assignStandardFieldRole} from '../shared/payload-field-roles';
import {formatJsonSyntaxError} from '../shared/payload-fields-json';
import {PresetPicker} from './preset-picker';
import type {PayloadField, PayloadProfile, PayloadRevision} from './payload-contracts';
import {devicePresetEvents} from './device-preset-selection';
import {type DeviceDraft, validateDeviceProfile} from './site-form-values';

export function DeviceFieldsTable({
  fields,
  billingSourceTag,
  locale,
  onChange,
  onRemove,
  onEdit,
  renderRegister,
  showErrors = false,
}: {
  fields: PayloadField[];
  billingSourceTag?: string | undefined;
  locale: string;
  onChange?: (index: number, patch: Partial<PayloadField>) => void;
  onRemove?: (index: number) => void;
  onEdit?: (index: number) => void;
  renderRegister?: (field: PayloadField) => React.ReactNode;
  showErrors?: boolean;
}) {
  const th = locale === 'th';
  if (!fields.length) {
    return (
      <div className={showErrors ? 'rounded-md border border-destructive bg-destructive/5 p-2 animate-shake' : undefined}>
        <Empty className="py-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><List /></EmptyMedia>
            <EmptyTitle>{th ? 'ยังไม่มีฟิลด์' : 'No fields yet'}</EmptyTitle>
            <EmptyDescription>{th ? 'เลือก Preset หรือเพิ่มฟิลด์ด้วยตัวเอง' : 'Choose a preset or add fields manually'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
        {showErrors && (
          <p role="alert" data-slot="field-error" className="text-xs text-destructive text-center pb-2">
            {th ? 'กรุณาเลือก Preset หรือเพิ่มฟิลด์อย่างน้อย 1 รายการ' : 'Please select a preset or add at least 1 field'}
          </p>
        )}
      </div>
    );
  }

  const isEditable = Boolean(onChange);

  return (
    <div className="min-w-0 overflow-hidden rounded-md border [&_[data-slot=table-container]]:max-h-80 [&_[data-slot=table-container]]:overflow-auto">
      <Table className="min-w-[950px]">
        <TableHeader className="sticky top-0 bg-white dark:bg-card z-10">
          <TableRow>
            <TableHead className="min-w-44">{th ? 'ฟิลด์' : 'Field'}</TableHead>
            <TableHead className="min-w-36">{th ? 'ชื่อ' : 'Name'}</TableHead>
            <TableHead className="min-w-28">{th ? 'ที่อยู่ Register' : 'Register Address'}</TableHead>
            <TableHead className="min-w-24">{th ? 'กลุ่ม' : 'Group'}</TableHead>
            <TableHead className="min-w-24">{th ? 'หน่วยต้นทาง' : 'Source unit'}</TableHead>
            <TableHead className="min-w-24">{th ? 'หน่วยปลายทาง' : 'Target unit'}</TableHead>
            <TableHead className="min-w-28">{th ? 'การแปลงหน่วย' : 'Conversion'}</TableHead>
            <TableHead className="min-w-36">{th ? 'บทบาท' : 'Role'}</TableHead>
            <TableHead className="w-16 text-center">{th ? 'จัดการ' : 'Actions'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field, index) => {
            if (!isEditable) {
              return (
                <TableRow key={field.tag || index}>
                  <TableCell className="font-mono text-xs">
                    {field.sourceTag && field.sourceTag !== field.tag ? `${field.sourceTag} → ` : ''}
                    {field.tag}
                  </TableCell>
                  <TableCell className="text-xs">{field.displayName}</TableCell>
                  <TableCell className="font-mono text-xs text-primary">{field.registerAddress || '—'}</TableCell>
                  <TableCell className="text-xs">{field.pollGroup}</TableCell>
                  <TableCell className="text-xs">{field.sourceUnit}</TableCell>
                  <TableCell className="text-xs font-mono">{field.targetUnit}</TableCell>
                  <TableCell className="text-xs font-mono">{field.conversion}</TableCell>
                  <TableCell className="text-xs">
                    {billingSourceTag === (field.sourceTag ?? field.tag) ? (
                      <Badge>{th ? 'แหล่งข้อมูลบิล' : 'Billing source'}</Badge>
                    ) : field.role === 'billing-import' ? (
                      <Badge variant="outline">{th ? 'พลังงานสะสม' : 'Cumulative energy'}</Badge>
                    ) : field.role === 'active-power' ? (
                      <Badge variant="secondary">{th ? 'กำลังไฟ' : 'Active power'}</Badge>
                    ) : (
                      field.role ?? '—'
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {onEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={(th ? 'แก้ไขฟิลด์ ' : 'Edit field ') + field.displayName}
                        onClick={() => onEdit(index)}
                      >
                        <Pencil className="size-3.5" />
                        <span>{th ? 'แก้ไข' : 'Edit'}</span>
                      </Button>
                    )}
                    {renderRegister && renderRegister(field)}
                  </TableCell>
                </TableRow>
              );
            }

            const unitOptions = [...new Set([...sourceUnits, ...(field.sourceUnit ? [field.sourceUnit] : [])])];
            const tagInvalid = showErrors && !/^[A-Za-z0-9_.-]{1,128}$/.test(field.tag);
            const nameInvalid = showErrors && !field.displayName.trim();
            const groupInvalid = showErrors && !field.pollGroup.trim();
            const sourceUnitInvalid = showErrors && !field.sourceUnit.trim();
            const targetUnitInvalid = showErrors && !field.targetUnit.trim();

            return (
              <TableRow key={index} className="hover:bg-muted/20">
                <TableCell className="p-1.5 align-top">
                  <Input
                    className="h-8 min-w-44 font-mono text-xs"
                    placeholder="energy.active.import.total"
                    aria-invalid={tagInvalid || undefined}
                    value={field.tag}
                    onChange={(e) => onChange!(index, { tag: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Input
                    className="h-8 min-w-36 text-xs"
                    placeholder={th ? 'ชื่อฟิลด์' : 'Field name'}
                    aria-invalid={nameInvalid || undefined}
                    value={field.displayName}
                    onChange={(e) => onChange!(index, { displayName: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Input
                    className="h-8 min-w-28 font-mono text-xs"
                    placeholder="0x0001"
                    value={field.registerAddress ?? ''}
                    onChange={(e) => onChange!(index, { registerAddress: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Input
                    className="h-8 min-w-24 text-xs"
                    placeholder="realtime"
                    aria-invalid={groupInvalid || undefined}
                    value={field.pollGroup}
                    onChange={(e) => onChange!(index, { pollGroup: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Select
                    value={field.sourceUnit || ''}
                    onValueChange={(val) => {
                      const source = val;
                      const target = compatibleUnits(source).includes(field.targetUnit) ? field.targetUnit : source;
                      onChange!(index, {
                        sourceUnit: source,
                        targetUnit: target,
                        conversion: derivedConversion(source, target),
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 min-w-24 text-xs" aria-invalid={sourceUnitInvalid || undefined}>
                      <SelectValue placeholder={th ? 'เลือกหน่วย' : 'Unit'} />
                    </SelectTrigger>
                    <SelectContent>
                      {unitOptions.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Input
                    className="h-8 min-w-20 font-mono text-xs"
                    placeholder="kWh"
                    aria-invalid={targetUnitInvalid || undefined}
                    value={field.targetUnit}
                    onChange={(e) => onChange!(index, { targetUnit: e.target.value })}
                  />
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Select
                    value={field.conversion ?? 'identity'}
                    onValueChange={(val) => {
                      onChange!(index, { conversion: val as PayloadField['conversion'] });
                    }}
                  >
                    <SelectTrigger className="h-8 min-w-28 text-xs font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identity">identity</SelectItem>
                      <SelectItem value="wh-to-kwh">wh-to-kwh</SelectItem>
                      <SelectItem value="varh-to-kvarh">varh-to-kvarh</SelectItem>
                      <SelectItem value="auto-v1">auto-v1</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="p-1.5 align-top">
                  <Select
                    value={field.role ?? 'none'}
                    onValueChange={(val) => {
                      const role = val as 'billing-import' | 'active-power' | 'none';
                      onChange!(index, { role });
                    }}
                  >
                    <SelectTrigger className="h-8 min-w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{th ? 'ทั่วไป (none)' : 'None'}</SelectItem>
                      <SelectItem value="billing-import">{th ? 'พลังงานคิดบิล (kWh)' : 'Billing energy (kWh)'}</SelectItem>
                      <SelectItem value="active-power">{th ? 'กำลังไฟ (W)' : 'Active power (W)'}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="p-1.5 text-center align-top">
                  {onRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={(th ? 'ลบฟิลด์ ' : 'Remove field ') + (field.displayName || index + 1)}
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function defaultDeviceTopic(siteCode?: string, gatewayCode?: string, deviceId?: string) {
  const s = siteCode?.trim() || '+';
  const g = gatewayCode?.trim() || '+';
  const d = deviceId?.trim() || '+';
  return `solar/v1/sites/${s}/gateways/${g}/devices/${d}/telemetry`;
}

export function composeAutoDeviceTopic(siteCode?: string, gatewayCode?: string, deviceId?: string) {
  const s = siteCode?.trim();
  const g = gatewayCode?.trim();
  const d = deviceId?.trim();
  if (!s || !g || !d) return '';
  return `solar/v1/sites/${s}/gateways/${g}/devices/${d}/telemetry`;
}

export function parseDeviceFieldsJsonStrict(rawText: string, baseConfig: PayloadProfile, billing: boolean, locale: string): PayloadProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(formatJsonSyntaxError(rawText, err));
  }
  const newFields = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as {fields?: unknown}).fields)
    ? (parsed as {fields: unknown[]}).fields
    : null;
  if (!newFields) {
    throw new Error('[root] expected JSON array of fields ([...]) or { "fields": [...] }');
  }
  const tags = new Set<string>();
  const normalizedFields: PayloadField[] = [];
  for (let i = 0; i < newFields.length; i++) {
    const item = newFields[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`[item #${i}] expected object ({...})`);
    }
    const rec = item as Record<string, unknown>;
    for (const key of ['tag', 'displayName', 'pollGroup', 'sourceUnit', 'targetUnit'] as const) {
      if (typeof rec[key] !== 'string' || !String(rec[key]).trim()) {
        throw new Error(`[item #${i}] missing "${key}": non-empty string required`);
      }
    }
    const conv = String(rec.conversion ?? 'identity');
    if (!['identity', 'wh-to-kwh', 'varh-to-kvarh', 'auto-v1'].includes(conv)) {
      throw new Error(`[item #${i}] invalid "conversion": "${conv}"`);
    }
    const tag = String(rec.tag);
    if (tags.has(tag)) {
      throw new Error(`[item #${i}] duplicate "tag": "${tag}"`);
    }
    tags.add(tag);
    normalizedFields.push(assignStandardFieldRole({ ...(rec as unknown as PayloadField), conversion: conv as PayloadField['conversion'] }));
  }
  const config: PayloadProfile = {
    ...baseConfig,
    fields: normalizedFields,
    pollGroups: [...new Set([...baseConfig.pollGroups, ...normalizedFields.map((f) => f.pollGroup || 'energy')])],
  };
  const problem = normalizedFields.length ? validateDeviceProfile(config, billing, locale) : null;
  if (problem) throw new Error(problem);
  return config;
}

export function DeviceProfileEditor({
  value,
  onChange,
  revisions,
  locale,
  billing = false,
  identityLocked = false,
  billingSourceTag,
  showPreset = true,
  showMetadata = true,
  showAdvanced = true,
  showErrors = false,
  siteCode,
  gatewayCode,
  onCatalogChange,
  renderRegister,
}: {
  value: DeviceDraft;
  onChange: (draft: DeviceDraft) => void;
  revisions: PayloadRevision[];
  locale: string;
  billing?: boolean;
  identityLocked?: boolean;
  billingSourceTag?: string;
  showPreset?: boolean;
  showMetadata?: boolean;
  showAdvanced?: boolean;
  showErrors?: boolean;
  siteCode?: string;
  gatewayCode?: string;
  onCatalogChange?: (rows: PayloadRevision[]) => void;
  renderRegister?: (field: PayloadField) => React.ReactNode;
}) {
  const th = locale === 'th';
  const id = React.useId();
  const [pending, setPending] = React.useState<{id: string; revision: PayloadRevision | undefined} | null>(null);
  const [error, setError] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  const [shakeKey, setShakeKey] = React.useState(0);

  const visibleRevisions = revisions.filter(
    (r) => (!identityLocked || r.config.deviceType === value.config.deviceType) && (!billing || r.config.deviceType !== 'solar-logger')
  );

  const latestPresetState = React.useRef({catalog: revisions, draft: value, onCatalogChange});
  latestPresetState.current = {catalog: revisions, draft: value, onCatalogChange};
  const presetEvents = devicePresetEvents(() => latestPresetState.current, visibleRevisions);
  const latestOnChange = React.useRef(onChange);
  latestOnChange.current = onChange;

  const changeProfile = (config: PayloadProfile) => onChange({...value, config, dirty: true, profileDirty: true});

  function choose(presetId: string, confirmed = false, selectedRevision?: PayloadRevision) {
    try {
      const next = presetEvents.select(presetId, confirmed, selectedRevision);
      setError('');
      setJsonError('');
      if (next) {
        latestOnChange.current(next);
        setPending(null);
      } else setPending({id: presetId, revision: selectedRevision});
    } catch {
      setPending(null);
      setError(th ? 'ไม่พบ Preset กรุณาโหลดรายการและเลือกอีกครั้ง' : 'Preset unavailable. Reload the catalogue and select again.');
    }
  }

  const [fieldView, setFieldView] = React.useState<'table' | 'json'>('table');
  const [fieldsJson, setFieldsJson] = React.useState(() => JSON.stringify(value.config.fields, null, 2));
  const lastSyncedFields = React.useRef(value.config.fields);

  React.useEffect(() => {
    if (value.config.fields !== lastSyncedFields.current) {
      lastSyncedFields.current = value.config.fields;
      if (fieldView === 'table') {
        setFieldsJson(JSON.stringify(value.config.fields, null, 2));
        setJsonError('');
      }
    }
  }, [value.config.fields, fieldView]);

  function updateField(index: number, patch: Partial<PayloadField>) {
    const current = value.config.fields[index];
    if (!current) return;
    const nextField = { ...current, ...patch };
    const nextFields = value.config.fields.map((f, i) => (i === index ? nextField : f));
    const nextConfig = {
      ...value.config,
      fields: nextFields,
      pollGroups: [...new Set([...value.config.pollGroups, ...nextFields.map((f) => f.pollGroup || 'energy')])],
    };
    lastSyncedFields.current = nextFields;
    changeProfile(nextConfig);
    setError('');
  }

  function removeField(index: number) {
    const nextFields = value.config.fields.filter((_, i) => i !== index);
    const nextConfig = { ...value.config, fields: nextFields };
    lastSyncedFields.current = nextFields;
    changeProfile(nextConfig);
    setError('');
  }

  function addField() {
    const newF: PayloadField = {
      tag: '',
      displayName: '',
      registerAddress: '',
      pollGroup: value.config.pollGroups[0] ?? 'energy',
      sourceUnit: '',
      targetUnit: '',
      conversion: 'identity',
    };
    const nextFields = [...value.config.fields, newF];
    const nextConfig = { ...value.config, fields: nextFields };
    lastSyncedFields.current = nextFields;
    changeProfile(nextConfig);
    setError('');
  }

  function handleJsonChange(raw: string) {
    setFieldsJson(raw);
    try {
      const nextConfig = parseDeviceFieldsJsonStrict(raw, value.config, billing, locale);
      lastSyncedFields.current = nextConfig.fields;
      changeProfile(nextConfig);
      setJsonError('');
      setError('');
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : (th ? 'JSON ฟิลด์ไม่ถูกต้อง' : 'Invalid fields JSON'));
    }
  }

  function handleSwitchToTable() {
    if (fieldView === 'table') return;
    try {
      const nextConfig = parseDeviceFieldsJsonStrict(fieldsJson, value.config, billing, locale);
      lastSyncedFields.current = nextConfig.fields;
      changeProfile(nextConfig);
      setJsonError('');
      setError('');
      setFieldView('table');
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : (th ? 'JSON ฟิลด์ไม่ถูกต้อง' : 'Invalid fields JSON'));
      setShakeKey((k) => k + 1);
    }
  }

  function handleSwitchToJson() {
    if (fieldView === 'json') return;
    setFieldsJson(JSON.stringify(value.config.fields, null, 2));
    setJsonError('');
    setFieldView('json');
  }

  const nameMissing = showErrors && !value.name.trim();
  const modelMissing = showErrors && !value.model.trim();
  const serialMissing = showErrors && !value.serialNumber.trim();
  const codeInvalid = showErrors && !identityLocked && Boolean(value.externalDeviceId.trim()) && !/^[-A-Za-z0-9_]{1,128}$/.test(value.externalDeviceId.trim());

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {showPreset && (
        <PresetPicker
          allowCreate={false}
          billingOnly={billing}
          revisions={visibleRevisions}
          value={value.sourcePresetRevisionId ?? value.payloadProfileRevisionId}
          onChange={(id, revision) => choose(id, false, revision)}
          {...(onCatalogChange ? { onCatalogChange: presetEvents.update } : {})}
        />
      )}

      {showMetadata && (
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          {(['name', 'externalDeviceId', 'model', 'serialNumber'] as const).map((key, index) => {
            const isInvalid =
              (key === 'name' && nameMissing) ||
              (key === 'model' && modelMissing) ||
              (key === 'serialNumber' && serialMissing) ||
              (key === 'externalDeviceId' && codeInvalid);
            const errorMsg =
              key === 'name' && nameMissing
                ? th ? 'กรุณาระบุชื่ออุปกรณ์' : 'Device name is required'
                : key === 'model' && modelMissing
                ? th ? 'กรุณาระบุรุ่นอุปกรณ์' : 'Device model is required'
                : key === 'serialNumber' && serialMissing
                ? th ? 'กรุณาระบุซีเรียลจริง' : 'Serial number is required'
                : key === 'externalDeviceId' && codeInvalid
                ? th ? 'ใช้ตัวอักษร A-Z, 0-9, _ หรือ - เท่านั้น' : 'Use A-Z, 0-9, _ or - only'
                : '';

            return (
              <Field key={key} data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor={id + key}>
                  {(th ? ['ชื่ออุปกรณ์', 'Device ID', 'รุ่นอุปกรณ์', 'ซีเรียลจริง'] : ['Device name', 'Device ID', 'Model', 'Actual serial'])[index]}
                </FieldLabel>
                <Input
                  id={id + key}
                  required={key !== 'externalDeviceId'}
                  aria-invalid={isInvalid || undefined}
                  placeholder={
                    key === 'externalDeviceId'
                      ? (identityLocked ? (th ? 'ยังไม่ได้ลงทะเบียนรหัส' : 'No registered code') : (th ? 'เว้นว่างเพื่อสุ่มรหัสอัตโนมัติ' : 'Leave blank to generate a code'))
                      : key === 'name'
                      ? (th ? 'เช่น มิเตอร์หลัก' : 'e.g. Main meter')
                      : key === 'model'
                      ? (th ? 'เช่น Pilot SPM91' : 'e.g. Pilot SPM91')
                      : (th ? 'ระบุซีเรียลบนตัวอุปกรณ์' : 'Enter serial printed on device')
                  }
                  readOnly={key === 'externalDeviceId' && identityLocked}
                  value={value[key]}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (key === 'externalDeviceId') {
                      const prevAuto = composeAutoDeviceTopic(siteCode, gatewayCode, value.externalDeviceId);
                      const isAuto = !value.telemetryTopic || value.telemetryTopic === prevAuto;
                      const nextTopic = isAuto ? composeAutoDeviceTopic(siteCode, gatewayCode, val) : value.telemetryTopic;
                      onChange({ ...value, externalDeviceId: val, telemetryTopic: nextTopic, dirty: true });
                      return;
                    }
                    onChange({ ...value, [key]: val, dirty: true });
                  }}
                />
                {isInvalid && <FieldError className="text-xs">{errorMsg}</FieldError>}
              </Field>
            );
          })}
          <Field>
            <FieldLabel htmlFor={id + 'expectedInterval'}>
              {th ? 'รอบรับข้อมูล (วินาที)' : 'Data cadence (seconds)'}
            </FieldLabel>
            <Input
              id={id + 'expectedInterval'}
              type="number"
              min="1"
              max="86400"
              required
              value={value.expectedIntervalSeconds ?? (billing ? 5 : 15)}
              onChange={(e) => onChange({ ...value, expectedIntervalSeconds: Number(e.target.value) || 1, dirty: true })}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={id + 'telemetryTopic'}>
              {th ? 'รูปแบบ Topic' : 'Telemetry topic'}
            </FieldLabel>
            <Input
              id={id + 'telemetryTopic'}
              className="font-mono text-xs"
              placeholder={defaultDeviceTopic(siteCode, gatewayCode, value.externalDeviceId)}
              value={value.telemetryTopic ?? ''}
              onChange={(e) => onChange({ ...value, telemetryTopic: e.target.value, dirty: true })}
            />
          </Field>
        </FieldGroup>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{th ? 'รายการฟิลด์ข้อมูล' : 'Data Fields'} ({value.config.fields.length})</span>
        <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs">
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${fieldView === 'table' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={handleSwitchToTable}
          >
            {th ? 'ตาราง' : 'Table'}
          </button>
          <button
            type="button"
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${fieldView === 'json' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={handleSwitchToJson}
          >
            JSON
          </button>
        </div>
      </div>

      {fieldView === 'table' ? (
        <div className="space-y-3">
          <DeviceFieldsTable
            fields={value.config.fields}
            locale={locale}
            onChange={updateField}
            onRemove={removeField}
            billingSourceTag={billingSourceTag}
            showErrors={showErrors}
            {...(renderRegister ? { renderRegister } : {})}
          />
          <Button type="button" variant="outline" size="sm" className="self-start gap-1.5" onClick={addField}>
            <Plus className="size-3.5" />
            <span>{th ? 'เพิ่มฟิลด์' : 'Add field'}</span>
          </Button>
        </div>
      ) : (
        <div key={shakeKey} className={`space-y-2.5 ${shakeKey > 0 && jsonError ? 'animate-shake' : ''}`}>
          <Field data-invalid={!!jsonError || undefined}>
            <FieldLabel htmlFor={id + 'fields-json'}>
              {th ? 'แก้ไขรายการฟิลด์ด้วย JSON (ซิงค์อัตโนมัติ)' : 'Edit fields via JSON (auto-synced)'}
            </FieldLabel>
            <Textarea
              id={id + 'fields-json'}
              value={fieldsJson}
              aria-invalid={!!jsonError || undefined}
              onChange={(e) => handleJsonChange(e.target.value)}
              className="h-56 min-h-36 max-h-[70vh] font-mono text-xs overflow-y-auto resize-y"
            />
          </Field>
          {jsonError && (
            <div
              role="alert"
              data-slot="field-error"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive"
            >
              {jsonError}
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{th ? 'เขียนทับค่าที่แก้ไข?' : 'Overwrite device edits?'}</DialogTitle>
            <DialogDescription>
              {th ? 'ใช้ชื่อ รุ่น และฟิลด์จาก Preset ที่เลือก โดยคง Device ID และซีเรียลจริง' : 'Use the selected preset name, model and fields. Device ID and actual serial are retained.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button type="button" onClick={() => choose(pending!.id, true, pending!.revision)}>
              {th ? 'ยืนยันเขียนทับ' : 'Confirm overwrite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
