'use client';

import type {GatewayConfigState,GatewayConnectionState,GatewayLifecycleState} from '@solar/api-contracts';
import type {ComponentProps} from 'react';
import {Badge} from '../../components/ui/badge';
import {formatAppDateTime} from '../../lib/date-format';

export interface GatewayOperationalSource {
  lifecycleState?:GatewayLifecycleState;
  configState?:GatewayConfigState;
  connectionState?:GatewayConnectionState;
  status?:string;
  appliedVersion?:number|null;
  lastReceivedAt?:string|null;
  pollingIntervalSeconds?:number;
}

export type GatewayTelemetryFreshness='fresh'|'stale'|'unknown';

export function gatewayTelemetryFreshness(gateway:GatewayOperationalSource,now=Date.now()):GatewayTelemetryFreshness {
  if(!gateway.lastReceivedAt)return 'unknown';
  const received=new Date(gateway.lastReceivedAt).getTime();
  if(!Number.isFinite(received))return 'unknown';
  const tolerance=Math.max(120,(gateway.pollingIntervalSeconds??60)*2)*1000;
  return now-received<=tolerance?'fresh':'stale';
}

export function gatewayConnectionState(gateway:GatewayOperationalSource):GatewayConnectionState {
  if(gateway.connectionState)return gateway.connectionState;
  return gateway.status==='online'||gateway.status==='offline'?gateway.status:'unknown';
}

export function GatewayOperationalStatus({gateway,locale='en',now,compact=false}:{gateway:GatewayOperationalSource;locale?:string;now?:number;compact?:boolean}){
  const th=locale==='th';
  const lifecycle=gateway.lifecycleState??'discovered';
  const config=gateway.configState??'draft';
  const connection=gatewayConnectionState(gateway);
  const freshness=gatewayTelemetryFreshness(gateway,now);
  const lifecycleLabel={discovered:th?'ตรวจพบแล้ว':'Discovered',configuring:th?'กำลังตั้งค่า':'Configuring',active:th?'ใช้งานอยู่':'Active',disabled:th?'ปิดใช้งาน':'Disabled'}[lifecycle];
  const configLabel=config==='applied'&&gateway.appliedVersion?`${th?'ใช้งานแล้ว':'Applied'} v${gateway.appliedVersion}`:{draft:th?'ฉบับร่าง':'Draft',pending_sync:th?'รอซิงก์':'Pending synchronization',applied:th?'ใช้งานแล้ว':'Applied',failed:th?'ไม่สำเร็จ':'Failed',drifted:th?'ไม่ตรงกัน':'Drifted'}[config];
  const connectionLabel={online:th?'ออนไลน์':'Online',offline:th?'ออฟไลน์':'Offline',unknown:th?'ไม่ทราบ':'Unknown'}[connection];
  const freshnessLabel={fresh:th?'ล่าสุด':'Fresh',stale:th?'ล้าสมัย':'Stale',unknown:th?'ยังไม่มีข้อมูล':'No telemetry'}[freshness];
  const items:Array<{name:string;label:string;variant:ComponentProps<typeof Badge>['variant']}>=[
    {name:th?'การกำหนด':'Assignment',label:lifecycleLabel,variant:lifecycle==='active'?'default':lifecycle==='disabled'?'destructive':'secondary' as const},
    {name:th?'การตั้งค่า':'Configuration',label:configLabel,variant:config==='failed'||config==='drifted'?'destructive':config==='applied'?'default':'secondary' as const},
    {name:th?'การเชื่อมต่อ':'Connection',label:connectionLabel,variant:connection==='online'?'default':connection==='offline'?'outline':'secondary' as const},
    {name:th?'ข้อมูลโทรมาตร':'Telemetry',label:freshnessLabel,variant:freshness==='stale'?'destructive':freshness==='fresh'?'default':'outline' as const},
  ];
  return <div className="flex flex-wrap gap-2" aria-label={th?'สถานะการทำงานเกตเวย์':'Gateway operational status'}>
    {items.map(item=><div key={item.name} className="flex items-center gap-1.5">{!compact&&<span className="text-xs text-muted-foreground">{item.name}</span>}<Badge variant={item.variant}>{item.label}</Badge></div>)}
    {!compact&&<span className="text-xs text-muted-foreground">{th?'รับข้อมูลล่าสุด':'Last received'}: {gateway.lastReceivedAt?formatAppDateTime(gateway.lastReceivedAt,th?'th':'en'):'—'}</span>}
  </div>;
}
