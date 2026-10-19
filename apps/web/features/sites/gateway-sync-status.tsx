'use client';

import * as React from 'react';
import type {GatewaySyncState} from '@solar/api-contracts';
import {Copy,KeyRound,RefreshCw} from 'lucide-react';
import {Alert,AlertAction,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {
  AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,
  AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogTrigger,
} from '../../components/ui/alert-dialog';
import {Badge} from '../../components/ui/badge';
import {Button} from '../../components/ui/button';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '../../components/ui/card';
import {Spinner} from '../../components/ui/spinner';

export interface OneTimeGatewayCredential {username:string;password:string}

function syncCopy(value:string){
  if(typeof navigator!=='undefined'&&navigator.clipboard)return navigator.clipboard.writeText(value);
  return Promise.resolve();
}

function syncMessage(state:GatewaySyncState,th:boolean){
  if(state.configState==='applied')return {title:th?'ใช้งานการตั้งค่าแล้ว':'Configuration applied',description:th?'เกตเวย์ยืนยันการตั้งค่าเวอร์ชันที่ต้องการแล้ว':'The gateway reported the desired configuration as applied.',terminal:true};
  if(state.configState==='failed')return {title:th?'ซิงก์การตั้งค่าไม่สำเร็จ':'Synchronization failed',description:state.lastError?.message??state.lastError?.code??(th?'เกตเวย์รายงานข้อผิดพลาด':'The gateway reported an application error.'),terminal:true};
  if(state.connectionState!=='online')return {title:th?'รอเกตเวย์เชื่อมต่อใหม่':'Waiting for gateway reconnect',description:th?'ตั้งค่าบัญชีถาวรบนเครื่อง แล้วเชื่อมต่อด้วย Username และ Gateway ID เดียวกัน':'Configure the permanent credential on the gateway, then reconnect with username and client ID equal to the gateway ID.',terminal:false};
  if(state.lastReceivedAt)return {title:th?'เกตเวย์รับการตั้งค่าแล้ว':'Configuration received',description:th?'กำลังรอเครื่องนำการตั้งค่าไปใช้และส่ง configStatus: applied':'Waiting for the gateway to apply the configuration and report configStatus: applied.',terminal:false};
  return {title:th?'กำลังส่งการตั้งค่า':'Delivering configuration',description:th?'เกตเวย์เชื่อมต่อแล้ว ระบบกำลังรอสถานะรับการตั้งค่า':'The gateway is connected; waiting for its configuration receipt status.',terminal:false};
}

export function GatewaySyncStatus({locale,credential,syncState,syncError=null,onRetry,retrying=false,onRotate,rotating}:{
  locale:string;
  credential:OneTimeGatewayCredential|null;
  syncState:GatewaySyncState;
  syncError?:unknown;
  onRetry?:()=>void|Promise<unknown>;
  retrying?:boolean;
  onRotate:()=>void|Promise<void>;
  rotating:boolean;
}){
  const th=locale==='th';
  const message=syncMessage(syncState,th);
  const syncErrorMessage=syncError instanceof Error?syncError.message:syncError?(th?'ไม่สามารถยืนยันสถานะล่าสุดได้':'The latest state could not be verified.'):null;
  return <div className="flex flex-col gap-4">
    {credential&&<Card size="sm">
      <CardHeader className="border-b py-4">
        <CardTitle>{th?'ข้อมูลเชื่อมต่อ MQTT แสดงครั้งเดียว':'One-time MQTT credential'}</CardTitle>
        <CardDescription>{th?'คัดลอกไปตั้งค่าที่เกตเวย์ทันที ระบบจัดเก็บเฉพาะรหัสผ่านที่แฮชแล้ว':'Copy this to the gateway now. The server stores only the password hash.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 truncate font-mono">{credential.username}</span><Button type="button" size="icon" variant="outline" aria-label={th?'คัดลอกชื่อผู้ใช้':'Copy username'} onClick={()=>void syncCopy(credential.username)}><Copy data-icon="inline-start"/></Button></div>
          <div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 break-all font-mono">{credential.password}</span><Button type="button" size="icon" variant="outline" aria-label={th?'คัดลอกรหัสผ่าน':'Copy password'} onClick={()=>void syncCopy(credential.password)}><Copy data-icon="inline-start"/></Button></div>
        </div>
        <Alert>
          <KeyRound/>
          <AlertTitle>{th?'บันทึกข้อมูลนี้ก่อนปิด':'Save this credential before closing'}</AlertTitle>
          <AlertDescription>{th?'การปิดหน้าต่างนี้จะซ่อนรหัสผ่านถาวรและไม่สามารถเปิดดูรหัสเดิมได้อีก':'Closing this dialog permanently hides this password; it cannot be shown again.'}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>}

    <Card size="sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2"><span>{th?'สถานะการซิงก์':'Configuration sync'}</span><Badge variant={message.terminal?'secondary':'outline'}>{syncState.configState}</Badge></CardTitle>
        <CardDescription>{th?`เวอร์ชันที่ต้องการ ${syncState.desiredConfigVersion??'—'} · ใช้งานแล้ว ${syncState.activeConfigVersion??'—'}`:`Desired version ${syncState.desiredConfigVersion??'—'} · active ${syncState.activeConfigVersion??'—'}`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 py-4">
        {syncErrorMessage&&<Alert variant="destructive"><AlertTitle>{th?'โหลดสถานะซิงก์ล่าสุดไม่สำเร็จ':'Could not refresh sync status'}</AlertTitle><AlertDescription>{syncErrorMessage}</AlertDescription>{onRetry&&<AlertAction><Button type="button" size="sm" variant="outline" disabled={retrying} onClick={()=>void onRetry()}>{retrying&&<Spinner data-icon="inline-start"/>}{th?'ลองอีกครั้ง':'Retry'}</Button></AlertAction>}</Alert>}
        <Alert variant={syncState.configState==='failed'?'destructive':'default'}>
          {!message.terminal&&<Spinner/>}
          <AlertTitle>{message.title}</AlertTitle>
          <AlertDescription>{message.description}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{th?'การเชื่อมต่อ':'Connection'}: {syncState.connectionState}</Badge><Badge variant="outline">{th?'วงจรชีวิต':'Lifecycle'}: {syncState.lifecycleState}</Badge></div>
      </CardContent>
    </Card>

    <AlertDialog>
      <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={rotating}><RefreshCw data-icon="inline-start"/>{th?'หมุนรหัสเชื่อมต่อ':'Rotate credential'}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{th?'ยืนยันการหมุนรหัสเชื่อมต่อ':'Confirm credential rotation'}</AlertDialogTitle><AlertDialogDescription>{th?'รหัสเดิมจะใช้ไม่ได้ทันที ต้องนำรหัสใหม่ไปตั้งค่าที่เกตเวย์':'The previous password will stop working immediately. Configure the new password on the gateway.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={rotating}>{th?'ยกเลิก':'Cancel'}</AlertDialogCancel><AlertDialogAction disabled={rotating} onClick={()=>void onRotate()}>{rotating&&<Spinner data-icon="inline-start"/>}{th?'ออกข้อมูลเชื่อมต่อใหม่':'Issue new credential'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
