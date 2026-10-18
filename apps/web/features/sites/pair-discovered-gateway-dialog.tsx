'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ChoiceSelect } from '../../components/ui/choice-select';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import type { DiscoveredGatewayRow } from '@solar/api-contracts';
import { Loader2, Radio } from 'lucide-react';

interface SiteOption {
  id: string;
  name: string;
  code: string;
  active: boolean;
  assignedGatewayId: string | null;
}

export function PairDiscoveredGatewayDialog({
  open,
  onOpenChange,
  discovered,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discovered: DiscoveredGatewayRow | null;
  onSuccess: () => void;
}) {
  const locale = useLocale();
  const th = locale === 'th';
  const [sites, setSites] = React.useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = React.useState('');
  const [gatewayName, setGatewayName] = React.useState('');
  const [loadingSites, setLoadingSites] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open && discovered) {
      setError('');
      setGatewayName(`Gateway ${discovered.externalGatewayId}`);
      setSelectedSiteId('');
      setLoadingSites(true);
      apiClient
        .get<SiteOption[]>('/v1/gateways/site-options?includeAssigned=true')
        .then((data) => {
          setSites(data);
          // Try auto-matching by reported site ID / code
          if (discovered.reportedSiteId) {
            const matched = data.find(
              (s) =>
                s.code?.toLowerCase() === discovered.reportedSiteId?.toLowerCase() ||
                s.id === discovered.reportedSiteId
            );
            if (matched) {
              setSelectedSiteId(matched.id);
            }
          }
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoadingSites(false));
    }
  }, [open, discovered]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discovered || !selectedSiteId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/v1/gateways/assign-discovered', {
        discoveredGatewayId: discovered.id,
        siteId: selectedSiteId,
        name: gatewayName.trim() || undefined,
      });
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!discovered) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-2xl">
        <DialogHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Radio className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {th ? 'เชื่อมต่อเกตเวย์เข้ากับไซต์งาน' : 'Pair Gateway to Site'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {th
                  ? 'กำหนดไซต์งานให้กับอุปกรณ์เกตเวย์ที่ตรวจพบใหม่'
                  : 'Assign a site to the newly discovered gateway'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Gateway Detected Facts */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className="text-muted-foreground">{th ? 'รหัสเกตเวย์:' : 'Gateway Code:'}</span>{' '}
                <strong className="text-foreground font-mono">{discovered.externalGatewayId}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">{th ? 'รุ่น / ผู้ผลิต:' : 'Model:'}</span>{' '}
                <span className="text-foreground">
                  {[discovered.manufacturer, discovered.model].filter(Boolean).join(' ') || '—'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">{th ? 'ไซต์ที่ระบุมา:' : 'Reported Site:'}</span>{' '}
                <span className="text-foreground">{discovered.reportedSiteId || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{th ? 'อุปกรณ์ที่ส่งมา:' : 'Reported Device:'}</span>{' '}
                <span className="text-foreground">{discovered.reportedDeviceId || '—'}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pair-gw-name" className="text-xs font-semibold">
                {th ? 'ชื่อเกตเวย์' : 'Gateway Name'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pair-gw-name"
                value={gatewayName}
                onChange={(e) => setGatewayName(e.target.value)}
                required
                className="text-base md:text-sm h-10"
                placeholder={th ? 'เช่น Gateway อาคาร 1' : 'e.g. Gateway Building 1'}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pair-site-select" className="text-xs font-semibold">
                {th ? 'เลือกไซต์งานที่ต้องการเชื่อมต่อ' : 'Select Target Site'}{' '}
                <span className="text-destructive">*</span>
              </Label>
              {loadingSites ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground h-10">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{th ? 'กำลังโหลดรายการไซต์...' : 'Loading sites...'}</span>
                </div>
              ) : (
                <ChoiceSelect
                  id="pair-site-select"
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full text-base md:text-sm h-10"
                  required
                >
                  <option value="">{th ? '-- กรุณาเลือกไซต์งาน --' : '-- Select a site --'}</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} ({site.code})
                      {site.assignedGatewayId ? (th ? ' [มีเกตเวย์แล้ว]' : ' [Already paired]') : ''}
                    </option>
                  ))}
                </ChoiceSelect>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2 border-t border-border/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="w-full sm:w-auto h-10 text-base md:text-sm"
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !selectedSiteId || !gatewayName.trim()}
              className="w-full sm:w-auto h-10 text-base md:text-sm"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              {th ? 'บันทึกการเชื่อมต่อ' : 'Save Pairing'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
