'use client';
import {useSessionUser} from '../../providers/session-user-provider';
import {gatewayPermissions} from './gateway-permissions';

import { useRouter } from 'next/navigation';
import { useEffect,useState,type FormEvent } from 'react';
import { apiClient } from '../../lib/api-client';
import { useLocale } from '../../providers/locale-provider';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { GatewayIndex,type GatewayRow } from './gateway-index';
import { GatewayDetailModal } from './gateway-detail-modal';
import { GatewayFormDialog } from './gateway-form-dialog';
import { GatewayEditDialog } from './gateway-edit-dialog';
import { PairDiscoveredGatewayDialog } from './pair-discovered-gateway-dialog';
import type { MetricSources } from './dashboard-source-model';
import type { PayloadConfig } from './payload-contracts';
import type { DiscoveredGatewayRow } from '@solar/api-contracts';

export type GatewayConfig = PayloadConfig & {
  metricSources?: MetricSources;
  mqttBrokerId?: string;
  pollingIntervalSeconds: number;
  configuration: {
    desiredVersion: number | null;
    publishedVersion: number | null;
    acknowledgedVersion: number | null;
    appliedVersion: number | null;
  };
  cadence: {
    id: string;
    expectedIntervalSeconds: number;
    pollGroups: Record<string, number>;
  }[];
};

export function GatewayWorkspace() {
  let router: { push: (url: string) => void };
  try {
    router = useRouter();
  } catch {
    router = { push: (url: string) => { if (typeof window !== 'undefined') window.location.href = url; } };
  }
  const locale = useLocale(), th = locale === 'th', permissions = gatewayPermissions(useSessionUser());
  const [rows, setRows] = useState<GatewayRow[]>([]);
  const [discoveredRows, setDiscoveredRows] = useState<DiscoveredGatewayRow[]>([]);
  const [detailRow, setDetailRow] = useState<GatewayRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editRow, setEditRow] = useState<GatewayRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pairGateway, setPairGateway] = useState<DiscoveredGatewayRow | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.get<GatewayRow[]>('/v1/gateways')
      .then(data => { if (active) setRows(data); })
      .catch(e => { if (active) setError(e.message); });

    apiClient.get<DiscoveredGatewayRow[]>('/v1/gateways/discovered?status=unassigned')
      .then(data => { if (active) setDiscoveredRows(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [revision]);

  const handleOpenDetail = (row: GatewayRow) => {
    router.push(`/gateways/${row.id}`);
  };

  const handleOpenEdit = (row: GatewayRow) => {
    setEditRow(row);
    setEditOpen(true);
  };

  const handleOpenPair = (row: DiscoveredGatewayRow) => {
    setPairGateway(row);
    setPairOpen(true);
  };

  return (
    <main className="content space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{th ? 'จัดการเกตเวย์' : 'Manage gateways'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {th ? 'ติดตามการเชื่อมต่อ อุปกรณ์ และการรับข้อมูลของแต่ละไซต์' : 'Track connections, devices and data reception by site'}
          </p>
        </div>
        {permissions.gatewayEdit && (
          <Button onClick={() => setAddOpen(true)}>
            {th ? 'เพิ่มเกตเวย์' : 'Add gateway'}
          </Button>
        )}
      </header>

      {error && <p role="alert" className="text-destructive">{error}</p>}

      <GatewayIndex
        rows={rows}
        discoveredRows={discoveredRows}
        locale={locale}
        onSelect={handleOpenEdit}
        onViewDetail={handleOpenDetail}
        onPairDiscovered={handleOpenPair}
      />

      <GatewayDetailModal
        gateway={detailRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onConfigure={permissions.gatewayEdit ? (row) => {
          setDetailOpen(false);
          handleOpenEdit(row);
        } : undefined}
      />

      <PairDiscoveredGatewayDialog
        open={pairOpen}
        onOpenChange={setPairOpen}
        discovered={pairGateway}
        onSuccess={() => setRevision(n => n + 1)}
      />

      <GatewayFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        brokerAccess={permissions.brokerView}
        onSaved={() => {
          setRevision(n => n + 1);
          setAddOpen(false);
        }}
      />

      <GatewayEditDialog
        gateway={editRow}
        open={editOpen}
        onOpenChange={setEditOpen}
        permissions={permissions}
        onSaved={() => setRevision(n => n + 1)}
        onReplaced={() => {
          setEditOpen(false);
          setEditRow(null);
          setRevision(n => n + 1);
        }}
      />
    </main>
  );
}

export function DeviceCadences({config,onSaved}:{config:GatewayConfig;onSaved:()=>void}){
  const th=useLocale()==='th';
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{th?'รอบรับข้อมูลรายอุปกรณ์':'Device reception cadence'}</h2>
      {config.cadence.map(cadence=><CadenceForm key={cadence.id} cadence={cadence} name={config.devices.find(d=>d.id===cadence.id)?.name??cadence.id} onSaved={onSaved}/>)}
    </section>
  );
}

export function CadenceForm({cadence,name,onSaved}:{cadence:GatewayConfig['cadence'][number];name:string;onSaved:()=>void}){
  const th=useLocale()==='th',permissions=gatewayPermissions(useSessionUser());
  const [seconds,setSeconds]=useState(String(cadence.expectedIntervalSeconds)),[groups,setGroups]=useState(cadence.pollGroups),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function save(e:FormEvent){
    e.preventDefault();
    if(!permissions.deviceEdit)return;
    setBusy(true);
    try{
      await apiClient.patch(`/v1/devices/${cadence.id}/cadence`,{expectedIntervalSeconds:Number(seconds),pollGroups:groups});
      onSaved();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <h3>{name}</h3>
      <fieldset disabled={!permissions.deviceEdit} className="contents">
        <div className="flex justify-between gap-4 items-center">
          <Label htmlFor={`cadence-${cadence.id}`}>{th?'คาดหวังทุก (วินาที)':'Expected interval (seconds)'}</Label>
          <Input className="w-32" id={`cadence-${cadence.id}`} type="number" min="1" required value={seconds} onChange={e=>setSeconds(e.target.value)}/>
        </div>
        {Object.entries(groups).map(([group,value])=><div className="flex justify-between gap-4 items-center" key={group}><Label htmlFor={`cadence-${cadence.id}-${group}`}>{group}</Label><Input className="w-32" id={`cadence-${cadence.id}-${group}`} type="number" min="1" required value={value} onChange={e=>setGroups({...groups,[group]:Number(e.target.value)})}/></div>)}
        {error&&<p role="alert">{error}</p>}
        {permissions.deviceEdit&&<Button disabled={busy} type="submit" variant="outline">{th?'บันทึกรอบรับข้อมูล':'Save cadence'}</Button>}
      </fieldset>
    </form>
  );
}

export function ConfigurationPublish({gatewayId,configuration,onSaved}:{gatewayId:string;configuration:GatewayConfig['configuration'];onSaved:()=>void}){
  const th=useLocale()==='th',permissions=gatewayPermissions(useSessionUser());
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function publish(){
    if(!permissions.gatewayEdit)return;
    setBusy(true);
    setError('');
    try{
      const result=await apiClient.post<{version:number;delivery:string}>(`/v1/gateways/${gatewayId}/configuration/publish`,{baseVersion:configuration.desiredVersion});
      setNotice(result.delivery==='published'?(th?'เผยแพร่แล้ว รออุปกรณ์ยืนยันรับและนำไปใช้':'Published; awaiting device acknowledgement and application'):(th?'รอการเชื่อมต่อเพื่อเผยแพร่':'Pending connection for publication'));
      onSaved();
    }catch(e){
      setError((e as Error).message);
    }finally{
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{th?'เผยแพร่เวอร์ชันการตั้งค่า':'Publish configuration version'}</h2>
      <div className="grid gap-2 sm:grid-cols-4">
        {([['desiredVersion','ต้องการ','Desired'],['publishedVersion','เผยแพร่','Published'],['acknowledgedVersion','ยืนยันรับ','Acknowledged'],['appliedVersion','ใช้งานแล้ว','Applied']] as const).map(([key,labelTh,labelEn])=><div key={key} className="flex justify-between gap-3"><span>{th?labelTh:labelEn}</span><strong>{configuration[key]??'—'}</strong></div>)}
      </div>
      {error&&<p role="alert">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {permissions.gatewayEdit&&<Button type="button" variant="outline" disabled={busy||configuration.desiredVersion===null} onClick={()=>void publish()}>{th?'เผยแพร่การตั้งค่า':'Publish configuration'}</Button>}
    </section>
  );
}
