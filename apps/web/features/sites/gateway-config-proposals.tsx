'use client';

import * as React from 'react';
import type {ColumnDef} from '@tanstack/react-table';
import type {ApproveGatewayProposalRequest,GatewayConfigProposal,GatewayDeviceConfig,GatewayRegisterMapping} from '@solar/api-contracts';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle,AlertDialogTrigger} from '../../components/ui/alert-dialog';
import {Badge} from '../../components/ui/badge';
import {Button} from '../../components/ui/button';
import {Card,CardContent,CardDescription,CardFooter,CardHeader,CardTitle} from '../../components/ui/card';
import {DataTable} from '../../components/ui/data-table';
import {Field,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Skeleton} from '../../components/ui/skeleton';
import {Spinner} from '../../components/ui/spinner';
import {Textarea} from '../../components/ui/textarea';
import {useLocale} from '../../providers/locale-provider';
import {apiErrorMessage} from '../../lib/api-error-message';
import {useQueryClient} from '@tanstack/react-query';
import {useGatewayConfigProposals,approveGatewayProposal,rejectGatewayProposal} from './gateway-onboarding-api';

export interface GatewayProposalDiffRow {id:string;deviceId:string;deviceModel:string;beforeDeviceConfiguration:string;afterDeviceConfiguration:string;tag:string;change:'added'|'removed'|'changed'|'unchanged';beforeAddress:string;afterAddress:string;beforeDecoder:string;afterDecoder:string;decoder:string;}
const mappingKey=(mapping:Partial<GatewayRegisterMapping>,index:number)=>mapping.tag?.trim()||`#${index+1}`;
type ProposalLocale='th'|'en';
const decoder=(mapping:Partial<GatewayRegisterMapping>|undefined,locale:ProposalLocale)=>mapping?(locale==='th'?[
  mapping.dataType?`ชนิดข้อมูล ${mapping.dataType}`:null,mapping.registerCount?`จำนวนรีจิสเตอร์ ${mapping.registerCount}`:null,
  mapping.scale!==undefined?`ตัวคูณ ${mapping.scale}`:null,mapping.offset!==undefined?`ค่าชดเชย ${mapping.offset}`:null,
  mapping.sourceUnit||mapping.targetUnit?`หน่วย ${mapping.sourceUnit??'—'} → ${mapping.targetUnit??'—'}`:null,
  mapping.conversion?`การแปลง ${mapping.conversion}`:null,mapping.byteOrder?`ลำดับไบต์ ${mapping.byteOrder}`:null,
  mapping.wordOrder?`ลำดับคำ ${mapping.wordOrder}`:null,mapping.pollGroup?`กลุ่มการอ่าน ${mapping.pollGroup}`:null,
  mapping.role?`บทบาท ${mapping.role}`:null,mapping.displayName?`ชื่อ ${mapping.displayName}`:null,
  mapping.sourceTag?`แท็กต้นทาง ${mapping.sourceTag}`:null,mapping.required!==undefined?`จำเป็น ${mapping.required?'ใช่':'ไม่'}`:null,
]:[
  mapping.dataType,mapping.registerCount?`×${mapping.registerCount}`:null,mapping.scale!==undefined?`scale ${mapping.scale}`:null,
  mapping.offset!==undefined?`offset ${mapping.offset}`:null,
  mapping.sourceUnit&&mapping.targetUnit?`${mapping.sourceUnit} → ${mapping.targetUnit}`:mapping.sourceUnit??mapping.targetUnit,
  mapping.conversion,mapping.byteOrder,mapping.wordOrder,mapping.pollGroup,mapping.role,mapping.displayName,
  mapping.sourceTag?`source tag ${mapping.sourceTag}`:null,mapping.required!==undefined?`required ${mapping.required?'yes':'no'}`:null,
]).filter(Boolean).join(' · '):'—';
const printable=(value:unknown)=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):JSON.stringify(value);
const thaiConnectionLabel=(key:string)=>({host:'โฮสต์',port:'พอร์ต',slaveId:'รหัสอุปกรณ์รอง',unitId:'รหัสหน่วย',baudRate:'อัตราบอด',parity:'พาริตี',dataBits:'บิตข้อมูล',stopBits:'บิตหยุด',path:'พาธ',transport:'การรับส่ง',topic:'หัวข้อ'} as Record<string,string>)[key]??`การเชื่อมต่อ ${key}`;
const deviceConfiguration=(device:GatewayDeviceConfig|undefined,locale:ProposalLocale)=>device?(locale==='th'?[
  device.enabled?'เปิดใช้งาน':'ปิดใช้งาน',({manual:'กำหนดเอง',preset:'ชุดตั้งต้น',gateway:'เกตเวย์'} as const)[device.mappingSource],
  device.protocol?`โปรโตคอล ${device.protocol}`:null,
  ...Object.entries(device.connection??{}).sort(([left],[right])=>left.localeCompare(right)).map(([key,value])=>`${thaiConnectionLabel(key)} ${printable(value)}`),
  device.pollGroups.length?`กลุ่มการอ่าน ${device.pollGroups.join(', ')}`:null,
  device.deviceType?`ประเภท ${device.deviceType}`:null,device.manufacturer?`ผู้ผลิต ${device.manufacturer}`:null,
  device.model?`รุ่น ${device.model}`:null,device.firmwareVersion?`เฟิร์มแวร์ ${device.firmwareVersion}`:null,
  device.serialNumber?`หมายเลขเครื่อง ${device.serialNumber}`:null,device.profileId?`โปรไฟล์ ${device.profileId}`:null,
  device.profileVersion?`เวอร์ชันโปรไฟล์ ${device.profileVersion}`:null,device.presetId?`ชุดตั้งต้น ${device.presetId}`:null,
  device.presetVersion?`เวอร์ชันชุดตั้งต้น ${device.presetVersion}`:null,
]:[
  device.enabled?'enabled':'disabled',device.mappingSource,device.protocol,
  ...Object.entries(device.connection??{}).sort(([left],[right])=>left.localeCompare(right)).map(([key,value])=>`${key} ${printable(value)}`),
  device.pollGroups.length?`polls ${device.pollGroups.join(', ')}`:null,
  device.deviceType?`type ${device.deviceType}`:null,device.manufacturer?`manufacturer ${device.manufacturer}`:null,
  device.model?`model ${device.model}`:null,device.firmwareVersion?`firmware ${device.firmwareVersion}`:null,
  device.serialNumber?`serial ${device.serialNumber}`:null,device.profileId?`profile ${device.profileId}`:null,
  device.profileVersion?`profile version ${device.profileVersion}`:null,device.presetId?`preset ${device.presetId}`:null,
  device.presetVersion?`preset version ${device.presetVersion}`:null,
]).filter(Boolean).join(' · '):'—';
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);

export function gatewayProposalDiffRows(proposal:GatewayConfigProposal,locale:ProposalLocale='en'):GatewayProposalDiffRow[] {
  const active=new Map((proposal.activeSnapshot?.devices??[]).map(device=>[device.deviceId,device]));
  const next=new Map(proposal.snapshot.devices.map(device=>[device.deviceId,device]));
  const rows:GatewayProposalDiffRow[]=[];
  for(const deviceId of new Set([...active.keys(),...next.keys()])){
    const before=active.get(deviceId),after=next.get(deviceId);
    const beforeMappings=new Map((before?.mappings??[]).map((mapping,index)=>[mappingKey(mapping,index),mapping]));
    const afterMappings=new Map((after?.mappings??[]).map((mapping,index)=>[mappingKey(mapping,index),mapping]));
    const tags=new Set([...beforeMappings.keys(),...afterMappings.keys()]);
    const syntheticZeroMappingRow=tags.size===0;
    if(syntheticZeroMappingRow)tags.add('—');
    for(const tag of tags){
      const previous=beforeMappings.get(tag),current=afterMappings.get(tag);
      const sameDeviceConfiguration=before&&after&&same({...before,mappings:[]},{...after,mappings:[]});
      const change=!before?'added':!after?'removed':syntheticZeroMappingRow?(sameDeviceConfiguration?'unchanged':'changed'):!previous?'added':!current?'removed':same(previous,current)&&sameDeviceConfiguration?'unchanged':'changed';
      const beforeDecoder=decoder(previous,locale),afterDecoder=decoder(current,locale);
      rows.push({id:`${deviceId}:${tag}`,deviceId,deviceModel:after?.model??before?.model??'—',beforeDeviceConfiguration:deviceConfiguration(before,locale),afterDeviceConfiguration:deviceConfiguration(after,locale),tag,change,beforeAddress:previous?.registerAddress??'—',afterAddress:current?.registerAddress??'—',beforeDecoder,afterDecoder,decoder:afterDecoder==='—'?beforeDecoder:afterDecoder});
    }
  }
  return rows;
}

export function gatewayProposalCanApprove(proposal:GatewayConfigProposal):boolean {
  return proposal.status==='pending'&&proposal.baseConfigVersion===proposal.activeConfigVersion;
}

export function gatewayProposalApprovalRequest(proposal:GatewayConfigProposal):ApproveGatewayProposalRequest {
  if(!gatewayProposalCanApprove(proposal))throw new Error('Stale proposal cannot be approved');
  return {expectedProposalId:proposal.proposalId,expectedBaseConfigVersion:proposal.baseConfigVersion};
}

export function validateGatewayProposalRejection(reason:string,locale:'th'|'en'='en'):string {
  const value=reason.trim();
  if(!value)throw new Error(locale==='th'?'กรุณาระบุเหตุผลในการปฏิเสธ':'Rejection reason is required');
  if(value.length>2048)throw new Error(locale==='th'?'เหตุผลต้องมีความยาวไม่เกิน 2,048 ตัวอักษร':'Rejection reason must not exceed 2,048 characters');
  return value;
}

export function gatewayProposalErrorMessage(kind:'load'|'approve'|'reject',error:unknown,locale:'th'|'en'):string {
  const status=typeof error==='object'&&error!==null&&typeof (error as {status?:unknown}).status==='number'?(error as {status:number}).status:undefined;
  const message=error instanceof Error?error.message:typeof error==='object'&&error!==null?(error as {message?:unknown}).message:undefined;
  if(status!==undefined)return apiErrorMessage(status,message,locale);
  const copy={load:['โหลดข้อเสนอการตั้งค่าไม่สำเร็จ กรุณาลองอีกครั้ง','Could not load configuration proposals. Try again.'],approve:['อนุมัติข้อเสนอไม่สำเร็จ กรุณาลองอีกครั้ง','Could not approve the proposal. Try again.'],reject:['ปฏิเสธข้อเสนอไม่สำเร็จ กรุณาลองอีกครั้ง','Could not reject the proposal. Try again.']} as const;
  return copy[kind][locale==='th'?0:1];
}

const statusVariant=(status:GatewayConfigProposal['status'])=>status==='rejected'||status==='stale'?'destructive':status==='approved'?'default':'secondary';

export function GatewayConfigProposalsView({proposals,canManage,busyId,onApprove,onReject,initialCorrection,statusContent}:{proposals:GatewayConfigProposal[];canManage:boolean;busyId?:string|null;onApprove:(proposal:GatewayConfigProposal)=>void|Promise<void>;onReject:(proposal:GatewayConfigProposal,reason:string)=>void|Promise<void>;initialCorrection?:React.ReactNode;statusContent?:React.ReactNode}){
  const th=useLocale()==='th';
  const [rejecting,setRejecting]=React.useState<GatewayConfigProposal|null>(null),[reason,setReason]=React.useState(''),[reasonError,setReasonError]=React.useState('');
  if(!proposals.length&&!initialCorrection&&!statusContent)return null;
  const columns:ColumnDef<GatewayProposalDiffRow>[]=[
    {accessorKey:'deviceId',header:th?'อุปกรณ์':'Device'},{accessorKey:'deviceModel',header:th?'รุ่น':'Model'},
    {accessorKey:'beforeDeviceConfiguration',header:th?'อุปกรณ์ก่อนเปลี่ยน':'Device before'},{accessorKey:'afterDeviceConfiguration',header:th?'อุปกรณ์หลังเปลี่ยน':'Device after'},
    {accessorKey:'tag',header:th?'รีจิสเตอร์ / แท็ก':'Register / tag'},
    {accessorKey:'change',header:th?'การเปลี่ยนแปลง':'Change',cell:({row})=>{const labels=th?{added:'เพิ่ม',removed:'นำออก',changed:'เปลี่ยนแปลง',unchanged:'ไม่เปลี่ยน'}:undefined;return <Badge variant={row.original.change==='removed'?'destructive':row.original.change==='unchanged'?'outline':'secondary'}>{labels?.[row.original.change]??row.original.change}</Badge>;}},
    {accessorKey:'beforeAddress',header:th?'ที่อยู่ก่อนเปลี่ยน':'Address before'},{accessorKey:'afterAddress',header:th?'ที่อยู่หลังเปลี่ยน':'Address after'},
    {accessorKey:'beforeDecoder',header:th?'ตัวถอดรหัสก่อนเปลี่ยน':'Decoder before'},{accessorKey:'afterDecoder',header:th?'ตัวถอดรหัสหลังเปลี่ยน':'Decoder after'},
  ];
  const labels=th?{pending:'รอตรวจสอบ',stale:'ล้าสมัย',approved:'อนุมัติแล้ว',rejected:'ปฏิเสธแล้ว'} as const:{pending:'Pending review',stale:'Stale',approved:'Approved',rejected:'Rejected'} as const;
  return <Card>
    <CardHeader className="px-6 py-5 border-b border-border/60"><CardTitle>{th?'ข้อเสนอการตั้งค่าจากเกตเวย์':'Gateway configuration proposals'}</CardTitle><CardDescription>{th?'ตรวจสอบการเปลี่ยนแปลงทั้งหมดก่อนอนุมัติเป็นคอนฟิกเวอร์ชันถัดไป':'Review every proposed device and register change before creating the next desired revision.'}</CardDescription></CardHeader>
    <CardContent className="space-y-4 px-6 py-5">{initialCorrection}{statusContent}<div className="flex flex-col gap-4">
    {proposals.map(proposal=>{
      const approvable=gatewayProposalCanApprove(proposal),busy=busyId===proposal.id;
      return <Card key={proposal.id}>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{proposal.proposalId}</CardTitle><Badge variant={statusVariant(proposal.status)}>{labels[proposal.status]}</Badge></div><CardDescription>{th?'เวอร์ชันฐาน':'Base version'} {proposal.baseConfigVersion} · {th?'เวอร์ชันที่ใช้งาน':'Active version'} {proposal.activeConfigVersion??'—'} · {proposal.snapshot.devices.length} {th?'อุปกรณ์':'devices'}</CardDescription></CardHeader>
        <CardContent><DataTable variant="embedded" hideSearch getRowId={row=>row.id} data={gatewayProposalDiffRows(proposal,th?'th':'en')} columns={columns}/></CardContent>
        {canManage&&(proposal.status==='pending'||proposal.status==='stale')?<CardFooter className="flex flex-wrap justify-end gap-2"><Button disabled={!approvable||busy} onClick={()=>void onApprove(proposal)}>{busy&&<Spinner data-icon="inline-start"/>}{th?'อนุมัติ':'Approve'}</Button><AlertDialog open={rejecting?.id===proposal.id} onOpenChange={open=>{if(open){setRejecting(proposal);setReason('');setReasonError('');}else setRejecting(null);}}><AlertDialogTrigger asChild><Button variant="destructive" disabled={busy}>{th?'ปฏิเสธ':'Reject'}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{th?'ปฏิเสธข้อเสนอการตั้งค่า':'Reject configuration proposal'}</AlertDialogTitle><AlertDialogDescription>{th?'ระบุเหตุผลที่ไม่ควรนำการตั้งค่านี้ไปใช้':'Record why this complete gateway configuration must not become the desired revision.'}</AlertDialogDescription></AlertDialogHeader><FieldGroup><Field data-invalid={Boolean(reasonError)}><FieldLabel htmlFor={`proposal-reason-${proposal.id}`}>{th?'เหตุผล':'Reason'}</FieldLabel><Textarea id={`proposal-reason-${proposal.id}`} value={reason} aria-invalid={Boolean(reasonError)} onChange={event=>{setReason(event.target.value);setReasonError('');}}/><FieldError>{reasonError}</FieldError></Field></FieldGroup><AlertDialogFooter><AlertDialogCancel>{th?'ยกเลิก':'Cancel'}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={event=>{try{const value=validateGatewayProposalRejection(reason,th?'th':'en');void onReject(proposal,value);setRejecting(null);}catch(error){event.preventDefault();setReasonError(error instanceof Error?error.message:(th?'กรุณาระบุเหตุผล':'Reason is required'));}}}>{th?'ยืนยันปฏิเสธ':'Reject proposal'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardFooter>:null}
      </Card>;
    })}
    </div></CardContent>
  </Card>;
}

export function GatewayConfigProposals({gatewayId,canManage,initialCorrection}:{gatewayId:string;canManage:boolean;initialCorrection?:React.ReactNode}){
  const locale=useLocale(),th=locale==='th',query=useGatewayConfigProposals(gatewayId,true),queryClient=useQueryClient();
  const [busyId,setBusyId]=React.useState<string|null>(null),[error,setError]=React.useState('');
  const approve=async(proposal:GatewayConfigProposal)=>{setBusyId(proposal.id);setError('');try{await approveGatewayProposal(queryClient,gatewayId,proposal.id,gatewayProposalApprovalRequest(proposal));}catch(cause){setError(gatewayProposalErrorMessage('approve',cause,locale));}finally{setBusyId(null);}};
  const reject=async(proposal:GatewayConfigProposal,reason:string)=>{setBusyId(proposal.id);setError('');try{await rejectGatewayProposal(queryClient,gatewayId,proposal.id,reason);}catch(cause){setError(gatewayProposalErrorMessage('reject',cause,locale));}finally{setBusyId(null);}};
  if(query.isPending)return initialCorrection?<GatewayConfigProposalsView proposals={[]} canManage={canManage} onApprove={approve} onReject={reject} initialCorrection={initialCorrection} statusContent={<div className="flex flex-col gap-2" role="status"><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>}/>:null;
  if(query.isError)return initialCorrection?<GatewayConfigProposalsView proposals={[]} canManage={canManage} onApprove={approve} onReject={reject} initialCorrection={initialCorrection} statusContent={<Alert variant="destructive"><AlertTitle>{th?'โหลดข้อเสนอการตั้งค่าไม่สำเร็จ':'Could not load configuration proposals'}</AlertTitle><AlertDescription>{gatewayProposalErrorMessage('load',query.error,locale)}</AlertDescription></Alert>}/>:null;
  return <GatewayConfigProposalsView proposals={query.data??[]} canManage={canManage} busyId={busyId} onApprove={approve} onReject={reject} initialCorrection={initialCorrection} statusContent={error?<Alert variant="destructive"><AlertTitle>{th?'ดำเนินการกับข้อเสนอไม่สำเร็จ':'Proposal action failed'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>:null}/>;
}
