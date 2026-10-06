"use client";

import {mergePresetCatalog,presetDeviceType} from "./preset-draft";
import {PresetPicker} from "./preset-picker";
import { PayloadImportPanel } from "./payload-import-panel";
import { Radio, Cpu, FileJson, AlertTriangle } from "lucide-react";
import { AddButton } from "../../components/ui/add-button";
import * as React from 'react';
import { apiClient } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, FieldGroup, FieldLabel } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { DataTable } from '../../components/ui/data-table';
import type { PayloadConfig, PayloadRevision } from './payload-contracts';
import { PayloadReceiveSettings } from './payload-receive-settings';

export function ProfileSelect({revisions,value,onChange,label='Preset',onCatalogChange}:{revisions:PayloadRevision[];value:string;onChange:(id:string)=>void;label?:string;onCatalogChange?:(rows:PayloadRevision[])=>void}) {return <PresetPicker revisions={revisions} value={value} onChange={onChange} label={label} {...(onCatalogChange?{onCatalogChange}:{})}/>;}
export function PayloadConnectionCard({ config, onRefresh, editable = false, edgeToEdge = false }: { config: PayloadConfig; onRefresh: () => void; editable?: boolean; edgeToEdge?:boolean }) {
  const [revisions, setRevisions] = React.useState<PayloadRevision[]>([]);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [attachment, setAttachment] = React.useState({ name: '', serialNumber: '', externalDeviceId: '', payloadProfileRevisionId: '' });
  const [attaching, setAttaching] = React.useState(false);
  React.useEffect(() => { if (editable) apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets').then(setRevisions).catch(e => setError(e.message)); }, [editable]);
  const upgrade = async (deviceId: string) => {
    setBusy(true); setError('');
    try { await apiClient.patch(`/v1/devices/${deviceId}/payload-profile`, {payloadProfileRevisionId: revision}); setEditing(null); onRefresh(); }
    catch(e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); } finally {setBusy(false);}
  };
  const attach = async () => {
    setBusy(true); setError('');
    const profile = revisions.find(r => r.id === attachment.payloadProfileRevisionId);
    try { await apiClient.post(`/v1/sites/${config.siteId}/devices`, {...attachment, model: profile?.config.displayName??''}); setAttaching(false); setAttachment({name:'',serialNumber:'',externalDeviceId:'',payloadProfileRevisionId:''}); onRefresh(); }
    catch(e) {setError(e instanceof Error ? e.message : 'เพิ่มอุปกรณ์ไม่สำเร็จ');} finally {setBusy(false);}
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch { setError('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความและคัดลอก'); } };
  return <section className={edgeToEdge ? "space-y-5" : "space-y-4 border-t pt-5"}><div className="flex min-w-0 flex-col gap-5"><section className={edgeToEdge ? "space-y-4 rounded-xl border bg-card px-6 py-5 shadow-sm" : "space-y-4"}><header className="space-y-1"><h3 className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-primary"/>การเชื่อมต่อ Payload มาตรฐาน 1.1</h3><p className="break-words text-sm text-muted-foreground">รหัสรับข้อมูลถูกตรึงหลังสร้างไซต์ การเปลี่ยนรหัสต้องลงทะเบียนการเชื่อมต่อใหม่ · ตัวส่งข้อมูล MQTT ต้องใช้ Broker เดียวกับที่เลือกใน Gateway · TCP ปกติใช้พอร์ต 1883 · 18083 เป็น Dashboard</p></header>
    {editable && <PayloadImportPanel revisions={revisions} existing={config} onApply={async plan=>{
      const previous=config.receiveRevision.config;
      await apiClient.post(`/v1/sites/${config.siteId}/payload-import`,{baseVersion:config.receiveRevision.version,devices:plan.devices,config:{...previous,...plan.receiveConfig,fieldPaths:previous.fieldPaths,deviceAliases:[...previous.deviceAliases.filter(a=>!plan.devices.some(d=>d.sourceId===a.source)),...plan.receiveConfig.deviceAliases]}});onRefresh();
    }}/>}
    {editable && config.receiveRevision && <PayloadReceiveSettings config={config} onRefresh={onRefresh}/>}
    {config.bundleFixture && <div className="space-y-2 rounded-lg bg-muted p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileJson className="size-4 text-primary"/>JSON ทดสอบครบทุกอุปกรณ์และกลุ่มข้อมูล</h3><p className="text-sm text-muted-foreground">ค่าจำลอง 1 ทุกฟิลด์สำหรับทดสอบเท่านั้น ห้ามใช้แทนค่ามิเตอร์จริง รีเฟรชก่อนคัดลอกเพื่อสร้างเวลาและ messageId ใหม่</p><Button type="button" variant="outline" className="h-10" onClick={()=>void copy(JSON.stringify(config.bundleFixture,null,2))}>คัดลอก JSON แบบชุด</Button></div>}
    <dl className="grid gap-4 text-sm sm:grid-cols-2 [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:break-all"><div><dt>รหัสไซต์สำหรับรับข้อมูล (Site ID)</dt><dd>{config.externalSiteId}</dd></div><div><dt>รหัสเกตเวย์สำหรับรับข้อมูล (Gateway ID)</dt><dd>{config.externalGatewayId}</dd></div><div><dt>Topic รับข้อมูล (Subscribe)</dt><dd className="break-all font-mono">{config.subscriptionTopic}</dd></div><div><dt>Topic ยืนยันการรับข้อมูล (dataAcept)</dt><dd className="break-all font-mono">{config.ackTopic}</dd></div></dl></section>
    {config.devices.map(device => <section key={device.id} className={edgeToEdge ? "space-y-4 overflow-hidden rounded-xl border bg-card px-6 pt-5 shadow-sm" : "space-y-4 border-t pt-5"}><header className="space-y-1"><h3 className="flex items-center gap-2 text-sm font-semibold"><Cpu className="size-4 text-primary"/>{device.name}</h3><p className="break-words text-sm text-muted-foreground">{device.externalDeviceId} · {device.profileId} · {device.profileVersion} · revision {device.profileRevisionId}</p></header><div className="flex min-w-0 flex-col gap-3 pb-4"><p className="break-all font-mono text-sm">Topic ส่งข้อมูล (Publish): {device.telemetryTopic}</p><Button type="button" variant="outline" onClick={() => void copy(device.telemetryTopic)}>คัดลอก Publish topic</Button><details><summary className="cursor-pointer text-sm font-medium">ตัวอย่าง JSON สำหรับอุปกรณ์นี้</summary><pre className="mt-3 max-h-64 min-w-0 overflow-auto rounded-lg bg-muted p-4 text-sm">{JSON.stringify(device.fixture,null,2)}</pre><Button type="button" variant="outline" onClick={() => void copy(JSON.stringify(device.fixture,null,2))}>คัดลอก JSON</Button></details>
      {device.fields && <div className={edgeToEdge?"-mx-6":undefined}><DataTable renderSearchToolbar={input=><div className={edgeToEdge?"px-6 pb-4":"pb-4"}><div className="max-w-xs">{input}</div></div>} variant="embedded" data={device.fields} columns={[{accessorKey:'tag',header:'ฟิลด์'},{accessorKey:'displayName',header:'ชื่อ'},{accessorKey:'pollGroup',header:'กลุ่ม'},{accessorKey:'sourceUnit',header:'หน่วยต้นทาง'},{accessorKey:'targetUnit',header:'หน่วยปลายทาง'},{accessorKey:'conversion',header:'การแปลง'},{accessorKey:'role',header:'หน้าที่'}]}/></div>}
      {editing === device.id && <FieldGroup><ProfileSelect revisions={revisions.filter(r => r.config.deviceType === presetDeviceType(revisions,device))} value={revision} onChange={setRevision} onCatalogChange={updated=>setRevisions(current=>mergePresetCatalog(current,updated,presetDeviceType(current,device)))}/><p className="text-sm text-muted-foreground">อัปเกรดการกำหนดค่าเท่านั้น ประวัติข้อมูลคงเวอร์ชันเดิม</p><Button type="button" disabled={busy || !revision || revision === device.profileRevisionId} onClick={() => void upgrade(device.id)}>ยืนยันอัปเกรด</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button></FieldGroup>}
    </div>{editable && editing !== device.id && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => {setEditing(device.id);setRevision(device.profileRevisionId);setError('');}}>แก้ไข / อัปเกรด Profile</Button></div>}</section>)}
    <p className="text-sm text-muted-foreground">การส่งข้อมูลใหม่ต้องใช้ messageId, lotNumber และเวลาใหม่ การ retry ด้วย ID เดิมตั้งใจ deduplicate · รีเฟรชเพื่อสร้าง fixture เวลาใหม่</p>
    <p className="text-sm text-muted-foreground">Topic ส่งข้อมูลต้องระบุรหัสอุปกรณ์จริง ห้ามใช้ + หรือ # ซึ่งใช้สำหรับ Subscribe เท่านั้น รองรับ JSON ข้อความเดี่ยวหรือชุด payloads; รหัสในข้อความต้องตรงกับอุปกรณ์ที่ลงทะเบียนหรือการจับคู่ที่บันทึกไว้ สถานะออนไลน์จะอัปเดตหลังรับข้อมูลล่าสุดที่ถูกต้อง</p><section className={edgeToEdge ? "space-y-4 overflow-hidden rounded-xl border bg-card px-6 pt-5 shadow-sm" : "space-y-4"}><h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-primary"/>ข้อความที่ปฏิเสธ</h3><div className={edgeToEdge?"-mx-6":undefined}><DataTable variant="embedded" renderSearchToolbar={input=><div className={edgeToEdge?"px-6 pb-4":"pb-4"}><div className="max-w-xs">{input}</div></div>} data={config.rejections} columns={[{accessorKey:'topic',header:'Topic'},{accessorKey:'reason',header:'เหตุผล'},{accessorKey:'receivedAt',header:'เวลารับ'}]}/></div></section>
    <section className={edgeToEdge ? "space-y-4 overflow-hidden rounded-xl border bg-card px-6 pt-5 shadow-sm" : "space-y-4"}><h3 className="flex items-center gap-2 text-sm font-semibold"><FileJson className="size-4 text-primary"/>ฟิลด์ต้นทางที่ยังไม่จับคู่</h3><div className={edgeToEdge?"-mx-6":undefined}><DataTable variant="embedded" renderSearchToolbar={input=><div className={edgeToEdge?"px-6 pb-4":"pb-4"}><div className="max-w-xs">{input}</div></div>} data={config.unmappedMessages.flatMap(m => m.unmapped.map((f,i)=>({...f,deviceId:m.deviceId,messageId:m.messageId,receivedAt:m.receivedAt,id:`${m.deviceId}-${m.messageId}-${i}`})))} getRowId={r=>r.id} columns={[{accessorKey:'deviceId',header:'Device'},{accessorKey:'messageId',header:'Message ID'},{accessorKey:'tag',header:'Tag'},{accessorKey:'rawValue',header:'Raw value'},{accessorKey:'rawUnit',header:'Raw unit'},{accessorKey:'receivedAt',header:'เวลารับ'}]}/></div></section>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {editable && attaching && <FieldGroup>{(['name','serialNumber','externalDeviceId'] as const).map(key => <Field key={key}><FieldLabel htmlFor={`attach-${key}`}>{key === 'serialNumber' ? 'ซีเรียลจริงของอุปกรณ์' : key === 'externalDeviceId' ? 'รหัสอุปกรณ์สำหรับรับข้อมูล (Device ID)' : 'ชื่ออุปกรณ์'}</FieldLabel><Input id={`attach-${key}`} value={attachment[key]} onChange={e => setAttachment({...attachment,[key]:e.target.value})}/></Field>)}<ProfileSelect revisions={revisions} value={attachment.payloadProfileRevisionId} onChange={id=>setAttachment({...attachment,payloadProfileRevisionId:id})} onCatalogChange={setRevisions}/><p className="text-sm text-muted-foreground">รุ่นเลือกตาม Profile · SmartLogger ไม่เป็นมิเตอร์คำนวณบิล</p><Button type="button" disabled={busy || Object.values(attachment).some(v=>!v.trim())} onClick={() => void attach()}>บันทึกอุปกรณ์</Button><Button type="button" variant="outline" onClick={() => setAttaching(false)}>ยกเลิก</Button></FieldGroup>}
  </div>{editable && !attaching && <div className="flex flex-wrap gap-2"><AddButton type="button" variant="outline" onClick={() => {setAttaching(true);setError('');}}>เพิ่มอุปกรณ์ / SmartLogger</AddButton></div>}</section>;
}
