'use client';

import * as React from 'react';
import {Copy,KeyRound,RefreshCw} from 'lucide-react';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogTrigger} from '../../components/ui/alert-dialog';
import {Button} from '../../components/ui/button';
import {Spinner} from '../../components/ui/spinner';
import {apiClient} from '../../lib/api-client';
import type {OneTimeGatewayCredential} from './gateway-sync-status';

const copy=(value:string)=>typeof navigator!=='undefined'&&navigator.clipboard?navigator.clipboard.writeText(value):Promise.resolve();

export interface GatewayCredentialRecoveryOperation {gatewayId:string;epoch:number;signal:AbortSignal}
export function createGatewayCredentialRecoveryGuard(initialGatewayId:string){
  let gatewayId=initialGatewayId,epoch=0,controller:AbortController|null=null;
  const invalidate=()=>{epoch+=1;controller?.abort();controller=null;};
  const scope=(nextGatewayId:string)=>{invalidate();gatewayId=nextGatewayId;};
  return {
    scope,
    close:invalidate,
    begin:(requestedGatewayId=gatewayId)=>{if(requestedGatewayId!==gatewayId)scope(requestedGatewayId);controller?.abort();controller=new AbortController();return {gatewayId,epoch,signal:controller.signal} satisfies GatewayCredentialRecoveryOperation;},
    isCurrent:(operation:GatewayCredentialRecoveryOperation)=>operation.gatewayId===gatewayId&&operation.epoch===epoch&&!operation.signal.aborted,
  };
}

export function GatewayCredentialRecoveryConfirmation({locale}:{locale:string}){
  const th=locale==='th';
  return <Alert><KeyRound/><AlertTitle>{th?'ข้อมูลเชื่อมต่อเดิมจะถูกยกเลิก':'Existing credential will be revoked'}</AlertTitle><AlertDescription>{th?'รหัสเดิมจะใช้ไม่ได้ทันทีหลังยืนยัน':'The previous credential will stop working immediately after confirmation.'}</AlertDescription></Alert>;
}

export function GatewayCredentialRecovery({gatewayId,locale}:{gatewayId:string;locale:string}){
  const th=locale==='th';
  const [open,setOpen]=React.useState(false),[rotatingFor,setRotatingFor]=React.useState<string|null>(null);
  const [credentialState,setCredentialState]=React.useState<{gatewayId:string;value:OneTimeGatewayCredential}|null>(null);
  const [errorState,setErrorState]=React.useState<{gatewayId:string;message:string}|null>(null);
  const [guard]=React.useState(()=>createGatewayCredentialRecoveryGuard(gatewayId));
  const rotating=rotatingFor===gatewayId,credential=credentialState?.gatewayId===gatewayId?credentialState.value:null,error=errorState?.gatewayId===gatewayId?errorState.message:'';
  React.useEffect(()=>{guard.scope(gatewayId);setCredentialState(null);setErrorState(null);setRotatingFor(null);},[gatewayId,guard]);
  React.useEffect(()=>()=>guard.close(),[guard]);
  function changeOpen(next:boolean){if(!next&&rotating)return;setOpen(next);if(!next){guard.close();setCredentialState(null);setErrorState(null);}}
  async function rotate(){
    if(rotating)return;
    const operation=guard.begin(gatewayId);
    setRotatingFor(operation.gatewayId);setErrorState(null);
    try{const next=await apiClient.post<OneTimeGatewayCredential>(`/v1/gateways/${encodeURIComponent(operation.gatewayId)}/credentials/rotate`,{},{signal:operation.signal});if(guard.isCurrent(operation))setCredentialState({gatewayId:operation.gatewayId,value:next});}
    catch(cause){if(guard.isCurrent(operation))setErrorState({gatewayId:operation.gatewayId,message:cause instanceof Error?cause.message:(th?'ออกข้อมูลเชื่อมต่อใหม่ไม่สำเร็จ':'Could not issue a replacement credential.')});}
    finally{if(guard.isCurrent(operation))setRotatingFor(null);}
  }
  return <AlertDialog open={open} onOpenChange={changeOpen}>
    <AlertDialogTrigger asChild><Button type="button" variant="outline"><KeyRound data-icon="inline-start"/>{th?'ออกข้อมูลเชื่อมต่อทดแทน':'Issue replacement credential'}</Button></AlertDialogTrigger>
    <AlertDialogContent onEscapeKeyDown={event=>{if(rotating)event.preventDefault();}}>
      <AlertDialogHeader><AlertDialogTitle>{credential?(th?'ข้อมูลเชื่อมต่อ MQTT แสดงครั้งเดียว':'One-time MQTT credential'):(th?'ออกข้อมูลเชื่อมต่อทดแทน':'Issue replacement credential')}</AlertDialogTitle><AlertDialogDescription>{credential?(th?'คัดลอกข้อมูลนี้ทันที ระบบไม่สามารถแสดงรหัสผ่านเดิมได้อีก':'Copy this credential now. The password cannot be shown again.'):(th?'ยืนยันผลกระทบก่อนออกข้อมูลใหม่':'Confirm the impact before issuing a replacement.')}</AlertDialogDescription></AlertDialogHeader>
      {!credential&&<GatewayCredentialRecoveryConfirmation locale={locale}/>} 
      {credential&&<div className="grid gap-3">
        <div className="flex items-center justify-between gap-2 rounded-md border p-3"><span className="min-w-0 truncate font-mono">{credential.username}</span><Button type="button" size="icon" variant="outline" aria-label={th?'คัดลอกชื่อผู้ใช้':'Copy username'} onClick={()=>void copy(credential.username)}><Copy/></Button></div>
        <div className="flex items-center justify-between gap-2 rounded-md border p-3"><span className="min-w-0 break-all font-mono">{credential.password}</span><Button type="button" size="icon" variant="outline" aria-label={th?'คัดลอกรหัสผ่าน':'Copy password'} onClick={()=>void copy(credential.password)}><Copy/></Button></div>
      </div>}
      {error&&<Alert variant="destructive"><AlertTitle>{th?'ดำเนินการไม่สำเร็จ':'Action failed'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter>{credential?<AlertDialogAction onClick={()=>changeOpen(false)}>{th?'ฉันบันทึกข้อมูลแล้ว':'I saved the credential'}</AlertDialogAction>:<><AlertDialogCancel disabled={rotating}>{th?'ยกเลิก':'Cancel'}</AlertDialogCancel><AlertDialogAction disabled={rotating} onClick={event=>{event.preventDefault();void rotate();}}>{rotating?<Spinner data-icon="inline-start"/>:<RefreshCw data-icon="inline-start"/>}{th?'ยืนยันและออกข้อมูลใหม่':'Confirm and issue replacement'}</AlertDialogAction></>}</AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
