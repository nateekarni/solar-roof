"use client";

import * as React from 'react';
import { Plus, Save, FlaskConical, Trash2, Settings2, Cpu } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, FieldLabel } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { PayloadConfig, PayloadReceiveConfig } from './payload-contracts';

type Preview = { messages: {key:string;status:'valid'|'rejected';deviceId?:string;messageId?:string;fields?:number;reason?:string;historical?:boolean}[];ignored:number;persisted:false };
export function PayloadReceiveSettings({ config, onRefresh, draft, onDraftChange, testOnly=false, advancedOnly=false, sampleInput }: {testOnly?:boolean;advancedOnly?:boolean;sampleInput?:string;config:PayloadConfig;onRefresh:()=>void;draft?:boolean;onDraftChange?:(value:PayloadReceiveConfig|null)=>void}) {
  const [settings,setSettings]=React.useState<PayloadReceiveConfig>(config.receiveRevision.config);
  const [paths,setPaths]=React.useState(JSON.stringify(config.receiveRevision.config.fieldPaths,null,2));
  const [input,setInput]=React.useState(sampleInput??'');
  const [topic,setTopic]=React.useState(config.devices[0]?.telemetryTopic??'');
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
  const [preview,setPreview]=React.useState<Preview|null>(null);
  React.useEffect(()=>{if(sampleInput!==undefined)setInput(sampleInput);},[sampleInput]);
  const generatedTopic=React.useRef(config.devices[0]?.telemetryTopic??'');
  React.useEffect(()=>{
    const next=config.devices[0]?.telemetryTopic??'',previous=generatedTopic.current;
    setTopic(current=>!current||current===previous?next:current);generatedTopic.current=next;setPreview(null);
  },[config.devices[0]?.telemetryTopic]);
  const id=React.useId();
  React.useEffect(()=>{setSettings(config.receiveRevision.config);setPaths(JSON.stringify(config.receiveRevision.config.fieldPaths,null,2));},[config.receiveRevision.id,config.receiveRevision.version]);
  const build=():PayloadReceiveConfig=>{
    const fieldPaths=JSON.parse(paths);
    if(!fieldPaths||typeof fieldPaths!=='object'||Array.isArray(fieldPaths))throw Error('การจับคู่ฟิลด์ต้องเป็น JSON object');
    return {...settings,fieldPaths};
  };
  React.useEffect(()=>{
    if (!draft || !onDraftChange) return;
    try { const fieldPaths=JSON.parse(paths); onDraftChange(fieldPaths && typeof fieldPaths==='object' && !Array.isArray(fieldPaths) ? {...settings,fieldPaths} : null); }
    catch { onDraftChange(null); }
  },[settings,paths,draft,onDraftChange]);
  const save=async()=>{
    setBusy(true);setError('');setNotice('');
    try {await apiClient.patch(`/v1/sites/${config.siteId}/payload-receive`,{baseVersion:config.receiveRevision.version,config:build()});setNotice('บันทึกการตั้งค่ารับข้อมูลแล้ว ใช้กับข้อความใหม่ทันที');setPreview(null);onRefresh();}
    catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}
  };
  const test=async()=>{
    setBusy(true);setError('');setPreview(null);
    try {setPreview(await apiClient.post<Preview>(draft ? '/v1/sites/payload-preview' : `/v1/sites/${config.siteId}/payload-preview`,{config:testOnly?config.receiveRevision.config:build(),input:JSON.parse(input),topic,...(draft?{externalSiteId:config.externalSiteId,externalGatewayId:config.externalGatewayId,devices:config.devices.map(d=>({externalDeviceId:d.externalDeviceId,payloadProfileRevisionId:d.profileRevisionId}))}:{})}));}
    catch(e){setError(e instanceof Error?e.message:'ทดสอบไม่สำเร็จ');}finally{setBusy(false);}
  };
  const changeAlias=(index:number,patch:Partial<PayloadReceiveConfig['deviceAliases'][number]>)=>{
    setSettings({...settings,deviceAliases:settings.deviceAliases.map((alias,i)=>i===index?{...alias,...patch}:alias)});setPreview(null);
  };
  return <section className="space-y-4 border-t pt-5">{!testOnly&&<header className="space-y-1"><h3 className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="size-4 text-primary"/>รูปแบบ Payload และการจับคู่รหัส</h3><p className="break-words text-sm text-muted-foreground">รองรับข้อความเดี่ยวและชุดข้อความ · การตั้งค่าเวอร์ชัน {config.receiveRevision.version} · คำยืนยันส่งหลังบันทึกแต่ละข้อความสำเร็จ</p></header>}<div className="space-y-5 pb-5">{!testOnly&&<details><summary className="cursor-pointer text-sm font-medium">ตั้งค่าขั้นสูง: รูปแบบข้อมูลและการจับคู่รหัส</summary><div className="mt-4 space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field><FieldLabel htmlFor={`${id}-path`}>ตำแหน่งชุดข้อความใน JSON</FieldLabel><Input id={`${id}-path`} value={settings.messagesPath} onChange={e=>{setSettings({...settings,messagesPath:e.target.value});setPreview(null);}}/><p className="text-sm text-muted-foreground">ตัวอย่างนี้ใช้ payloads; รองรับ object หรือ array ถ้าไม่มีตำแหน่งนี้จะตรวจเป็นข้อความเดี่ยว</p></Field>
      <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">ระบบข้ามตัวอย่าง dataAcept ในชุด รับได้สูงสุด 32 รายการต่อครั้ง เก็บเวลาต้นทางเดิมและป้องกันการส่งซ้ำด้วย messageId</div>
      <Field><FieldLabel htmlFor={`${id}-site`}>รหัสไซต์ที่มากับ Payload (ถ้าต่างจากระบบ)</FieldLabel><Input id={`${id}-site`} placeholder="เช่น SITE-001" value={settings.siteAlias??''} onChange={e=>{const {siteAlias,...rest}=settings;setSettings(e.target.value?{...rest,siteAlias:e.target.value}:rest);setPreview(null);}}/><p className="text-sm text-muted-foreground">จับคู่กับ {config.externalSiteId} เฉพาะรหัสที่ระบุ</p></Field>
      <Field><FieldLabel htmlFor={`${id}-gateway`}>รหัสเกตเวย์ที่มากับ Payload (ถ้าต่างจากระบบ)</FieldLabel><Input id={`${id}-gateway`} placeholder="เช่น GW-001" value={settings.gatewayAlias??''} onChange={e=>{const {gatewayAlias,...rest}=settings;setSettings(e.target.value?{...rest,gatewayAlias:e.target.value}:rest);setPreview(null);}}/><p className="text-sm text-muted-foreground">จับคู่กับ {config.externalGatewayId} บน Broker ของไซต์นี้</p></Field>
    </div>
    <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4 text-primary"/>จับคู่รหัสอุปกรณ์และโปรไฟล์</h3><Button type="button" variant="outline" className="h-10" disabled={busy||!config.devices.length||settings.deviceAliases.length>=32} onClick={()=>setSettings({...settings,deviceAliases:[...settings.deviceAliases,{source:'',target:config.devices[0]!.externalDeviceId}]})}><Plus/>เพิ่มการจับคู่</Button></div>
      {settings.deviceAliases.map((alias,index)=><div key={index} className="space-y-3 border-t pt-4"><div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field><FieldLabel htmlFor={`${id}-source-${index}`}>รหัสอุปกรณ์ใน Payload</FieldLabel><Input id={`${id}-source-${index}`} value={alias.source} placeholder="METER-001" onChange={e=>changeAlias(index,{source:e.target.value})}/></Field>
        <Field><FieldLabel htmlFor={`${id}-target-${index}`}>อุปกรณ์ที่ลงทะเบียนในระบบ</FieldLabel><Select value={alias.target} onValueChange={target=>{const device=config.devices.find(d=>d.externalDeviceId===target);const {profileAlias,...rest}=alias;changeAlias(index,{...rest,target,...(profileAlias&&device?{profileAlias:{...profileAlias,targetId:device.profileId,targetVersion:device.profileVersion}}:{})});}}><SelectTrigger id={`${id}-target-${index}`} className="h-10 w-full"><SelectValue/></SelectTrigger><SelectContent>{config.devices.map(device=><SelectItem key={device.id} value={device.externalDeviceId}>{device.name} · {device.externalDeviceId}</SelectItem>)}</SelectContent></Select></Field>
        <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`ลบการจับคู่ ${index+1}`} onClick={()=>{setSettings({...settings,deviceAliases:settings.deviceAliases.filter((_,i)=>i!==index)});setPreview(null);}}><Trash2/></Button>
      </div><div className="grid gap-3 sm:grid-cols-2">
        <Field><FieldLabel htmlFor={`${id}-profile-${index}`}>รหัสโปรไฟล์ที่มากับ Payload (ถ้าต่าง)</FieldLabel><Input id={`${id}-profile-${index}`} placeholder="schneider-pm2230" value={alias.profileAlias?.sourceId??''} onChange={e=>{const device=config.devices.find(d=>d.externalDeviceId===alias.target);if(!device)return;const {profileAlias,...rest}=alias;setSettings({...settings,deviceAliases:settings.deviceAliases.map((a,i)=>i===index?(e.target.value?{...rest,profileAlias:{sourceId:e.target.value,sourceVersion:profileAlias?.sourceVersion??'',targetId:device.profileId,targetVersion:device.profileVersion}}:rest):a)});setPreview(null);}}/></Field>
        <Field><FieldLabel htmlFor={`${id}-version-${index}`}>เวอร์ชันโปรไฟล์ที่มากับ Payload</FieldLabel><Input id={`${id}-version-${index}`} placeholder="1.0.0" disabled={!alias.profileAlias} value={alias.profileAlias?.sourceVersion??''} onChange={e=>alias.profileAlias&&changeAlias(index,{profileAlias:{...alias.profileAlias,sourceVersion:e.target.value}})}/></Field>
      </div><p className="text-sm text-muted-foreground">โปรไฟล์ปลายทาง: {config.devices.find(d=>d.externalDeviceId===alias.target)?.profileId} · {config.devices.find(d=>d.externalDeviceId===alias.target)?.profileVersion} เปลี่ยนเฉพาะคู่รหัสและเวอร์ชันที่ตรงกัน ฟิลด์ยังต้องผ่านการตรวจหน่วยและกลุ่ม</p></div>)}
    </div>
    <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">ขั้นสูง: จับคู่ตำแหน่งฟิลด์ JSON</summary><Field className="mt-3"><FieldLabel htmlFor={`${id}-fields`}>ตำแหน่งฟิลด์ต้นทาง</FieldLabel><Textarea id={`${id}-fields`} className="min-h-28 font-mono text-sm" value={paths} onChange={e=>{setPaths(e.target.value);setPreview(null);}}/><p className="text-sm text-muted-foreground">ตัวอย่าง {`{"messageId":"id","device.deviceId":"meter.id","data.values":"measurements.values"}`} ใช้ path ภายในแต่ละข้อความ ช่องที่ไม่ระบุใช้ชื่อมาตรฐานเดิม</p></Field></details>
    </div></details>
    }
    {!draft && !testOnly && <Button type="button" className="h-10" disabled={busy} onClick={()=>void save()}><Save/>บันทึกการตั้งค่ารับข้อมูล</Button>}
    {!advancedOnly&&<div className="space-y-3 border-t pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FlaskConical className="size-4 text-primary"/>ทดสอบ Payload ก่อนส่ง</h3><p className="text-sm text-muted-foreground">ตรวจด้วยการตั้งค่าที่กรอกอยู่ ยังไม่บันทึก Telemetry และไม่ส่งคำยืนยัน ต้องบันทึกการตั้งค่าก่อน Publish จริง</p>
      <Field><FieldLabel htmlFor={`${id}-topic`}>Topic ที่จะ Publish</FieldLabel><Input id={`${id}-topic`} className="font-mono" value={topic} onChange={e=>{setTopic(e.target.value);setPreview(null);}}/></Field>
      <Field><FieldLabel htmlFor={`${id}-input`}>JSON จาก Gateway</FieldLabel><Textarea id={`${id}-input`} className="min-h-40 max-h-80 font-mono text-sm" placeholder="วาง JSON ข้อความเดี่ยวหรือไฟล์ตัวอย่างที่มี payloads" value={input} onChange={e=>{setInput(e.target.value);setPreview(null);}}/></Field>
      <Button type="button" variant="outline" className="h-10" disabled={busy||!input.trim()} onClick={()=>void test()}><FlaskConical/>ตรวจสอบ JSON</Button>
      {preview&&<div role="status" className="space-y-2 rounded-lg bg-muted p-4 text-sm"><p>ผ่าน {preview.messages.filter(m=>m.status==='valid').length} · ไม่ผ่าน {preview.messages.filter(m=>m.status==='rejected').length} · ข้ามคำยืนยัน {preview.ignored}</p>{preview.messages.map((m,index)=><p key={index} className={m.status==='rejected'?'text-destructive':'text-foreground'}>{m.key} · {m.deviceId??'ไม่มีรหัสอุปกรณ์'} · {m.status==='valid'?`ผ่าน (${m.fields} ฟิลด์)${m.historical?' · ข้อมูลย้อนหลัง ไม่ทำให้สถานะออนไลน์':''}`:m.reason}</p>)}</div>}
    </div>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div></section>;
}
