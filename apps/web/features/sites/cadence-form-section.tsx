'use client';

import * as React from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Field, FieldGroup, FieldLabel } from '../../components/ui/field';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { Clock } from 'lucide-react';

export interface CadenceData {
  id: string;
  expectedIntervalSeconds: number;
  pollGroups: Record<string, number>;
}

export function CadenceFormSection({
  cadence,
  name,
  onSaved,
}: {
  cadence: CadenceData;
  name: string;
  onSaved: () => void;
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const [seconds, setSeconds] = React.useState(String(cadence.expectedIntervalSeconds));
  const [groups, setGroups] = React.useState(cadence.pollGroups);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setSeconds(String(cadence.expectedIntervalSeconds));
    setGroups(cadence.pollGroups);
  }, [cadence.expectedIntervalSeconds, cadence.pollGroups]);

  async function saveCadence(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiClient.patch(`/v1/devices/${cadence.id}/cadence`, {
        expectedIntervalSeconds: Number(seconds),
        pollGroups: groups,
      });
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={saveCadence} className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
          <Clock className="size-3.5 text-primary" />
          <span>{th ? 'รอบรับข้อมูล (จากเกตเวย์)' : 'Device Reception Cadence'}</span>
        </h4>
        <Button disabled={busy} type="submit" variant="outline" size="sm" className="h-7 text-xs">
          {busy ? (th ? 'กำลังบันทึก…' : 'Saving…') : th ? 'บันทึกรอบรับข้อมูล' : 'Save Cadence'}
        </Button>
      </div>
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`cadence-${cadence.id}`}>
            {th ? 'รอบอ่านคาดหวัง (วินาที)' : 'Expected interval (sec)'}
          </FieldLabel>
          <Input
            id={`cadence-${cadence.id}`}
            type="number"
            min="1"
            required
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            className="h-9 text-xs"
          />
        </Field>
        {Object.entries(groups).map(([group, value]) => (
          <Field key={group}>
            <FieldLabel htmlFor={`cadence-${cadence.id}-${group}`}>
              {group} ({th ? 'วินาที' : 'sec'})
            </FieldLabel>
            <Input
              id={`cadence-${cadence.id}-${group}`}
              type="number"
              min="1"
              required
              value={value}
              onChange={(e) => setGroups({ ...groups, [group]: Number(e.target.value) })}
              className="h-9 text-xs"
            />
          </Field>
        ))}
      </FieldGroup>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
