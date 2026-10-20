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

export function GatewayOperationalStatus({gateway,locale='en'}:{gateway:GatewayOperationalSource;locale?:string;now?:number;compact?:boolean}){
  const th=locale==='th';
  const status=gatewayPrimaryStatus(gateway);
  const label={unconnected:th?'ยังไม่เชื่อมต่อไซต์':'Not connected',connecting:th?'กำลังเชื่อมต่อ':'Connecting',online:th?'ออนไลน์':'Online',offline:th?'ออฟไลน์':'Offline'}[status];
  const variant=status==='online'?'default':status==='offline'?'outline':'secondary';
  return <Badge variant={variant} aria-label={`${th?'สถานะเกตเวย์':'Gateway status'}: ${label}`}>{label}</Badge>;
}
