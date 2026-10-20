'use client';

import type {DiscoveredGatewayRow} from '@solar/api-contracts';
import {Radio,RefreshCw} from 'lucide-react';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '../../components/ui/dialog';

export const gatewayRegistrationTopic=(gatewayId:string)=>`solar/v1/gateways/${gatewayId}/register`;

export function GatewayRegistrationRequiredNotice({gateway,locale='en'}:{gateway:Pick<DiscoveredGatewayRow,'externalGatewayId'>;locale?:string}){
  const th=locale==='th';
  return <Alert>
    <Radio/>
    <AlertTitle>{th?'ต้องรับข้อมูลลงทะเบียนจากเกตเวย์ก่อน':'Gateway registration is required'}</AlertTitle>
    <AlertDescription className="space-y-2">
      <p>{th?'รายการนี้มาจากข้อมูลรุ่นเก่าและยังไม่มี Snapshot สำหรับตั้งค่า ให้เกตเวย์ Publish ข้อมูล schema 1.1 ใหม่ แล้วลองตรวจสอบอีกครั้ง':'This legacy discovery has no configuration snapshot. Publish a fresh schema 1.1 registration from the gateway, then retry.'}</p>
      <dl className="grid gap-1 text-xs sm:grid-cols-[7rem_1fr]">
        <dt>{th?'Client ID':'Client ID'}</dt><dd><code>{gateway.externalGatewayId}</code></dd>
        <dt>{th?'การยืนยันตัวตน':'Authentication'}</dt><dd>{th?'Anonymous (เว้น Username/Password)':'Anonymous (leave username/password blank)'}</dd>
        <dt>{th?'Topic':'Topic'}</dt><dd className="break-all"><code>{gatewayRegistrationTopic(gateway.externalGatewayId)}</code></dd>
        <dt>QoS</dt><dd><code>1</code></dd>
        <dt>Retain</dt><dd><code>false</code></dd>
      </dl>
    </AlertDescription>
  </Alert>;
}

export function GatewayRegistrationRequiredDialog({gateway,locale,open,onOpenChange,onRetry,retrying=false,error}:{gateway:DiscoveredGatewayRow|null;locale:string;open:boolean;onOpenChange:(open:boolean)=>void;onRetry:()=>void;retrying?:boolean;error?:string}){
  const th=locale==='th';
  if(!gateway)return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>{th?'เตรียมข้อมูลเกตเวย์ก่อนเชื่อมต่อ':'Prepare gateway registration'}</DialogTitle><DialogDescription>{th?'ระบบยังเปิดขั้นตอนตั้งค่าไม่ได้จนกว่าจะได้รับ registration snapshot ล่าสุด':'Pairing becomes available after the latest registration snapshot is received.'}</DialogDescription></DialogHeader>
    <GatewayRegistrationRequiredNotice gateway={gateway} locale={locale}/>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>{th?'ปิด':'Close'}</Button>
      <Button type="button" disabled={retrying} onClick={onRetry}><RefreshCw data-icon="inline-start" className={retrying?'animate-spin':undefined}/>{th?'ตรวจสอบอีกครั้ง':'Check again'}</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
}
