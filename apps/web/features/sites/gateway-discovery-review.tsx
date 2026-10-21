'use client';

import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Badge} from '../../components/ui/badge';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '../../components/ui/card';
import {Field,FieldDescription,FieldLabel} from '../../components/ui/field';
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from '../../components/ui/select';
import type {GatewayOnboardingDraft,GatewaySiteOption} from './gateway-onboarding-draft';

export interface GatewayPairingSiteOption extends GatewaySiteOption {
  name:string;
  active:boolean;
  assignedGatewayId?:string|null;
}

function normalized(value:string|null|undefined){return value?.trim().toLocaleLowerCase()??'';}

export function gatewaySelectedSiteMatchesReport(draft:GatewayOnboardingDraft,sites:readonly GatewayPairingSiteOption[]):boolean {
  if(!draft.reportedSiteId||!draft.selectedSiteId)return true;
  const selected=sites.find(site=>site.id===draft.selectedSiteId);
  if(!selected)return false;
  const reported=normalized(draft.reportedSiteId);
  return [selected.id,selected.code,selected.externalSiteId].some(value=>normalized(value)===reported);
}

export function GatewayDiscoveryReview({draft,sites,onSiteChange,locale,showSiteSelector=true}:{
  draft:GatewayOnboardingDraft;
  sites:readonly GatewayPairingSiteOption[];
  onSiteChange:(siteId:string)=>void;
  locale:string;
  showSiteSelector?:boolean;
}){
  const th=locale==='th';
  const snapshot=draft.reported;
  const selected=sites.find(site=>site.id===draft.selectedSiteId);
  const mismatch=Boolean(draft.selectedSiteId&&draft.reportedSiteId&&!gatewaySelectedSiteMatchesReport(draft,sites));
  const facts=[
    [th?'Gateway ID':'Gateway ID',snapshot.gateway.gatewayId],
    [th?'Gateway Serial':'Gateway Serial',snapshot.gateway.gatewaySerial??'—'],
    [th?'รุ่นเกตเวย์':'Gateway model',snapshot.gateway.model],
    [th?'เวอร์ชันเฟิร์มแวร์':'Firmware version',snapshot.gateway.firmwareVersion],
    [th?'ไซต์ที่เครื่องรายงาน':'Reported site',draft.reportedSiteId??'—'],
    [th?'ตรวจพบล่าสุด':'Discovered at',snapshot.sentAt],
    [th?'จำนวนอุปกรณ์':'Device count',String(snapshot.devices.length)],
  ] as const;
  return <div className="flex flex-col gap-4">
    <Card size="sm">
      <CardHeader className="border-b py-4">
        <CardTitle>{th?'ข้อมูลที่เกตเวย์รายงาน':'Reported gateway facts'}</CardTitle>
        <CardDescription>{th?'ข้อมูลส่วนนี้เป็นต้นฉบับจากเครื่องและแก้ไขไม่ได้':'These source facts came from the gateway and cannot be edited.'}</CardDescription>
      </CardHeader>
      <CardContent className="py-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map(([label,value])=><div key={label} className="flex min-w-0 flex-col gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">{th?`Revision ${draft.discoveryRevision}`:`Revision ${draft.discoveryRevision}`}</Badge>
          <Badge variant="secondary">{snapshot.schemaVersion}</Badge>
        </div>
      </CardContent>
    </Card>

    {showSiteSelector&&<Field data-invalid={!draft.selectedSiteId||undefined}>
      <FieldLabel htmlFor="gateway-pairing-site">{th?'เลือกไซต์งานจริง':'Select actual site'}</FieldLabel>
      <Select value={draft.selectedSiteId} onValueChange={onSiteChange}>
        <SelectTrigger id="gateway-pairing-site" aria-label={th?'เลือกไซต์งานจริง':'Select actual site'} aria-invalid={!draft.selectedSiteId||undefined}>
          <SelectValue placeholder={th?'เลือกไซต์งาน':'Select a site'}/>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {sites.filter(site=>site.active).map(site=><SelectItem key={site.id} value={site.id}>{site.name} ({site.code??site.externalSiteId??site.id}){site.assignedGatewayId?(th?' · มีเกตเวย์แล้ว':' · already paired'):''}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{selected?(th?`ระบบจะผูกกับ ${selected.name}`:`The gateway will be assigned to ${selected.name}.`):(th?'ไซต์ที่เครื่องรายงานเป็นเพียงคำแนะนำ':'The gateway-reported site is only a suggestion.')}</FieldDescription>
    </Field>}

    {showSiteSelector&&mismatch&&<Alert>
      <AlertTitle>{th?'ไซต์ที่เลือกต่างจากไซต์ที่เครื่องรายงาน':'Selected site differs from the reported site'}</AlertTitle>
      <AlertDescription>{th?'ดำเนินการต่อได้ โดยไซต์ที่ผู้ดูแลเลือกรอบนี้จะเป็นค่าหลักของระบบ':'You can continue. The admin-selected site is authoritative for this assignment.'}</AlertDescription>
    </Alert>}
  </div>;
}
