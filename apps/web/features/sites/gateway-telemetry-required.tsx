'use client';

import type {DiscoveredGatewayRow} from '@solar/api-contracts';
import {Radio,RefreshCw} from 'lucide-react';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '../../components/ui/dialog';

type TelemetryIdentity=Pick<DiscoveredGatewayRow,'externalGatewayId'|'gatewaySerial'|'reportedSiteId'|'reportedDeviceId'>;

export const gatewayTelemetryTopic=(siteId:string,gatewayId:string,deviceId:string)=>
  `solar/v1/sites/${siteId}/gateways/${gatewayId}/devices/${deviceId}/telemetry`;

export function GatewayTelemetryRequiredNotice({gateway,locale='en'}:{gateway:TelemetryIdentity;locale?:string}){
  const th=locale==='th';
  const siteId=gateway.reportedSiteId||'SITE-001';
  const deviceId=gateway.reportedDeviceId||'DEVICE-001';
  return <Alert>
    <Radio/>
    <AlertTitle>{th?'ต้องรับ Telemetry ก่อน':'Telemetry is required'}</AlertTitle>
    <AlertDescription className="space-y-2">
      <p>{th?'Publish telemetry schema 1.1 แบบไม่มี Serial หรือ schema 1.2 ที่มี Serial ครบ แล้วตรวจสอบอีกครั้ง โดยไม่ต้องส่งข้อความลงทะเบียนแยก':'Publish schema 1.1 telemetry without serials, or schema 1.2 telemetry with both serials, then retry. No separate registration message is needed.'}</p>
      <dl className="grid gap-1 text-xs sm:grid-cols-[8rem_1fr]">
        <dt>Client ID</dt><dd><code>{gateway.gatewaySerial||gateway.externalGatewayId}</code></dd>
        <dt>{th?'การยืนยันตัวตน':'Authentication'}</dt><dd>{th?'Anonymous เฉพาะครั้งแรก':'Anonymous for first contact only'}</dd>
        <dt>Topic</dt><dd className="break-all"><code>{gatewayTelemetryTopic(siteId,gateway.externalGatewayId,deviceId)}</code></dd>
        <dt>QoS</dt><dd><code>1</code></dd>
        <dt>Retain</dt><dd><code>false</code></dd>
      </dl>
    </AlertDescription>
  </Alert>;
}

export function GatewayTelemetryRequiredDialog({gateway,locale,open,onOpenChange,onRetry,retrying=false,error}:{gateway:DiscoveredGatewayRow|null;locale:string;open:boolean;onOpenChange:(open:boolean)=>void;onRetry:()=>void;retrying?:boolean;error?:string}){
  const th=locale==='th';
  if(!gateway)return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>{th?'ส่ง Telemetry เพื่อเริ่มตั้งค่า':'Publish telemetry to start setup'}</DialogTitle><DialogDescription>{th?'ระบบรองรับทั้ง telemetry แบบมี Serial และไม่มี Serial':'Both telemetry with serials and legacy telemetry without serials can start pairing.'}</DialogDescription></DialogHeader>
    <GatewayTelemetryRequiredNotice gateway={gateway} locale={locale}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>{th?'ปิด':'Close'}</Button>
      <Button type="button" disabled={retrying} onClick={onRetry}><RefreshCw data-icon="inline-start" className={retrying?'animate-spin':undefined}/>{th?'ตรวจสอบอีกครั้ง':'Check again'}</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
}
