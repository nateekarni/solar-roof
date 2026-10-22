'use client';

import type {GatewayConfigState,GatewayConnectionState,GatewayLifecycleState} from '@solar/api-contracts';
import {Badge} from '../../components/ui/badge';

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
export type GatewayPrimaryStatus='unconnected'|'connecting'|'online'|'offline';

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

export function gatewayPrimaryStatus(gateway:GatewayOperationalSource):GatewayPrimaryStatus {
  if(gateway.lifecycleState==='discovered')return 'unconnected';
  if(gateway.lifecycleState!=='active')return 'connecting';
  return gateway.status==='online'?'online':'offline';
}

export function gatewayStatusClassName(status:GatewayPrimaryStatus):string {
  return {
    online:'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    offline:'border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950/70 dark:text-red-300',
    unconnected:'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    connecting:'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
  }[status];
}

export function GatewayOperationalStatus({gateway,locale='en'}:{gateway:GatewayOperationalSource;locale?:string;now?:number;compact?:boolean}){
  const th=locale==='th';
  const status=gatewayPrimaryStatus(gateway);
  const label={unconnected:th?'ยังไม่เชื่อมต่อไซต์':'Not connected',connecting:th?'กำลังเชื่อมต่อ':'Connecting',online:th?'ออนไลน์':'Online',offline:th?'ออฟไลน์':'Offline'}[status];
  return <Badge variant="outline" className={gatewayStatusClassName(status)} aria-label={`${th?'สถานะเกตเวย์':'Gateway status'}: ${label}`}>{label}</Badge>;
}
