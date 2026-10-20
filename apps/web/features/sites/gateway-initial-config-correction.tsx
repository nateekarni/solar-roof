'use client';

import * as React from 'react';
import type {CorrectInitialGatewayConfigRequest,GatewayDeviceConfig,GatewaySyncState} from '@solar/api-contracts';
import {AlertTriangle,Wrench} from 'lucide-react';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,DialogTrigger} from '../../components/ui/dialog';
import {Label} from '../../components/ui/label';
import {Spinner} from '../../components/ui/spinner';
import {Textarea} from '../../components/ui/textarea';
import {useLocale} from '../../providers/locale-provider';

export function canCorrectInitialConfig(state:GatewaySyncState):boolean {
  return state.lifecycleState==='configuring'&&state.activeConfigVersion===0&&
    ['pending_sync','failed'].includes(state.configState)&&Boolean(state.desiredConfig&&state.desiredConfigHash&&state.desiredConfigVersion);
}
export interface InitialCorrectionDraft {expectedBaseConfigVersion:number;expectedBaseConfigHash:string;devicesJson:string}

export function initialCorrectionDraft(state:GatewaySyncState):InitialCorrectionDraft {
  if(!canCorrectInitialConfig(state)||!state.desiredConfigVersion||!state.desiredConfigHash)throw new Error('Initial configuration is unavailable');
  return {expectedBaseConfigVersion:state.desiredConfigVersion,expectedBaseConfigHash:state.desiredConfigHash,
    devicesJson:JSON.stringify(state.desiredConfig?.devices??[],null,2)};
}
export function initialCorrectionRequest(draft:InitialCorrectionDraft,json:string):CorrectInitialGatewayConfigRequest {
  const parsed:unknown=JSON.parse(json);
  if(!Array.isArray(parsed))throw new Error('Devices must be a JSON array');
  return {expectedBaseConfigVersion:draft.expectedBaseConfigVersion,expectedBaseConfigHash:draft.expectedBaseConfigHash,devices:parsed as GatewayDeviceConfig[]};
}

export function isInitialCorrectionConflict(error:unknown):boolean {
  return typeof error==='object'&&error!==null&&(error as {status?:unknown}).status===409;
}

export function GatewayInitialConfigCorrection({gatewayId:_gatewayId,syncState,onCorrect,locale}:{gatewayId:string;syncState:GatewaySyncState;onCorrect:(request:CorrectInitialGatewayConfigRequest)=>Promise<unknown>;locale?:string}) {
  const contextLocale=useLocale(),th=(locale??contextLocale)==='th';
  const [open,setOpen]=React.useState(false),[draft,setDraft]=React.useState<InitialCorrectionDraft|null>(null),[json,setJson]=React.useState('');
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
  if(!canCorrectInitialConfig(syncState))return null;
  function changeOpen(next:boolean){
    if(busy)return;
    if(next){
      try{const snapshot=initialCorrectionDraft(syncState);setDraft(snapshot);setJson(snapshot.devicesJson);setError('');setOpen(true);}
      catch(cause){setError(cause instanceof Error?cause.message:'Initial configuration is unavailable');}
      return;
    }
    setOpen(false);setDraft(null);setError('');
  }
  async function submit(){
    setBusy(true);setError('');
    try{
      if(!draft)throw new Error('Initial configuration is unavailable');
      await onCorrect(initialCorrectionRequest(draft,json));setOpen(false);setDraft(null);
    }
    catch(cause){setError(isInitialCorrectionConflict(cause)
      ?(th?'ข้อมูลถูกแก้ไขโดยผู้ดูแลคนอื่น ปิดหน้าต่างนี้แล้วเปิดใหม่เพื่อโหลด Snapshot ล่าสุด':'Another admin changed this configuration. Close and reopen this dialog to load the latest snapshot.')
      :cause instanceof Error?cause.message:(th?'แก้ไขการตั้งค่าไม่สำเร็จ':'Could not correct configuration'));}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline"><Wrench data-icon="inline-start"/>{th?'แก้ไขการตั้งค่าเริ่มต้น':'Correct initial configuration'}</Button></DialogTrigger>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>{th?'แก้ไขการตั้งค่าเริ่มต้น':'Correct initial configuration'}</DialogTitle><DialogDescription>{th?'ตรวจสอบรายการอุปกรณ์ทั้งหมด ระบบจะสร้างเวอร์ชันใหม่และรอให้เกตเวย์นำไปใช้':'Review the complete device list. The system creates a new desired version and waits for the gateway to apply it.'}</DialogDescription></DialogHeader>
      <Alert><AlertTriangle/><AlertTitle>{th?'ต้องตรวจสอบทั้ง Snapshot':'Review the complete snapshot'}</AlertTitle><AlertDescription>{th?'การแก้ไขนี้ไม่อนุมัติอัตโนมัติและไม่เปลี่ยนเวอร์ชันที่ใช้งานจนกว่าจะได้รับ configStatus: applied':'This correction does not auto-activate. The active version changes only after matching configStatus: applied.'}</AlertDescription></Alert>
      <div className="space-y-2"><Label htmlFor="gateway-initial-config-devices">{th?'อุปกรณ์และ Register Mapping (JSON)':'Devices and register mappings (JSON)'}</Label><Textarea id="gateway-initial-config-devices" className="min-h-72 font-mono" value={json} onChange={event=>setJson(event.target.value)} aria-invalid={Boolean(error)}/>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>changeOpen(false)}>{th?'ยกเลิก':'Cancel'}</Button><Button type="button" disabled={busy} onClick={()=>void submit()}>{busy&&<Spinner data-icon="inline-start"/>}{th?'ตรวจสอบและสร้างเวอร์ชันใหม่':'Validate and create new version'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

