"use client";

import { AddButton } from "../../components/ui/add-button";
import { assignStandardFieldRole } from './payload-field-roles';
import { PayloadFieldsEditor } from './payload-fields-editor';
import * as React from 'react';
import { AppLoading } from '../../components/feedback/app-loading';
import { apiClient } from '../../lib/api-client';
import type { PayloadField, PayloadProfile, PayloadRevision } from '../sites/payload-contracts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { SearchInput } from '../../components/ui/search-input';
import { Input } from '../../components/ui/input';
import { Field, FieldGroup, FieldLabel } from '../../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Pencil } from 'lucide-react';
import { useLocale } from '../../providers/locale-provider';
import { DataTable } from '../../components/ui/data-table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export function PayloadProfileSettings() {
 const locale = useLocale();
 const text = (th:string,en:string) => locale === 'th' ? th : en;
 const [revisions,setRevisions] = React.useState<PayloadRevision[]>([]);
 const [draft,setDraft] = React.useState<PayloadProfile|null>(null);
 const [error,setError] = React.useState('');
 const [loading,setLoading] = React.useState(true);
 const [creating,setCreating] = React.useState(false);
 const [busy,setBusy] = React.useState(false);
 const [search,setSearch] = React.useState('');
 const [type,setType] = React.useState('all');
 React.useEffect(()=>{apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets').then(setRevisions).catch(e=>setError(e instanceof Error ? e.message : text('โหลดโปรไฟล์ไม่สำเร็จ','Could not load profiles'))).finally(()=>setLoading(false));},[]);
 const edit = (r:PayloadRevision) => { setCreating(false); const parts=r.version.split('.').map(Number); setDraft({...structuredClone(r.config),version:`${parts[0]}.${parts[1]}.${(parts[2]??0)+1}`});setError(''); };
 const save = async () => {if(!draft || busy)return; if(!draft.id.trim() || !draft.displayName.trim() || !draft.deviceType.trim() || !draft.version.trim() || !draft.pollGroups.some(v=>v.trim()) || !draft.fields.length){setError(text("กรอกข้อมูลโปรไฟล์ กลุ่มการอ่านค่า และเพิ่มอย่างน้อยหนึ่งฟิลด์", "Complete profile details, poll groups, and at least one field"));return;}setBusy(true);setError('');try{const saved=await apiClient.post<PayloadRevision>('/v1/settings/payload-presets',{config:{...draft,fields:draft.fields.map(assignStandardFieldRole)}});setRevisions(current=>[saved,...current]);setDraft(null);}catch(e){setError(e instanceof Error?e.message:text('บันทึกไม่สำเร็จ','Could not publish revision'));}finally{setBusy(false);}};
 const closeEditor = () => {if(busy)return;setDraft(null);setError('');};
 const update = (index:number, patch:Partial<PayloadField>) => {if(draft)setDraft({...draft,fields:draft.fields.map((f,i)=>i===index?{...f,...patch}:f)});};
 if(loading)return <AppLoading fullPage={false} message={text('กำลังโหลดโปรไฟล์ข้อมูล…','Loading payload profiles…')} />;
 return <section aria-labelledby="payload-profiles-heading" className="flex w-full min-w-0 flex-col gap-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="payload-profiles-heading" className="text-lg font-semibold">{text("โปรไฟล์ข้อมูล", "Payload profiles")}</h2><p className="text-sm text-muted-foreground">{text("โครงสร้างข้อมูลมาตรฐาน 1.1 · การแก้ไขสร้างเวอร์ชันใหม่ อุปกรณ์เดิมใช้เวอร์ชันที่ตรึงไว้จนกว่าจะอัปเกรด", "Canonical schema 1.1 · Edits publish a new revision. Devices keep their pinned version until upgraded.")}</p></div>
  <AddButton type="button" className="h-10" onClick={()=>{setCreating(true);setError('');setDraft({id:'',version:'',schemaVersion:'1.1',displayName:'',deviceType:'',pollGroups:[],fields:[]});}}>{text("เพิ่มโปรไฟล์", "Add profile")}</AddButton></div>
<FieldGroup className="gap-3 sm:flex-row sm:items-end sm:justify-between"><Field className="w-full sm:max-w-xs"><FieldLabel htmlFor="payload-search">{text("ค้นหาโปรไฟล์", "Search profiles")}</FieldLabel><SearchInput id="payload-search" placeholder={text("ค้นหาชื่อโปรไฟล์ รุ่น หรือเวอร์ชัน…", "Search profile, model, or version…")} value={search} onChange={e=>setSearch(e.target.value)}/></Field><Field className="w-full sm:ml-auto sm:w-52 sm:shrink-0"><FieldLabel htmlFor="payload-type">{text("ประเภทอุปกรณ์", "Device type")}</FieldLabel><Select value={type} onValueChange={setType}><SelectTrigger id="payload-type" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{text("ทั้งหมด", "All types")}</SelectItem>{[...new Set(revisions.map(r=>r.config.deviceType))].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup>
 {revisions.filter(r=>(type==='all'||r.config.deviceType===type)&&`${r.config.displayName} ${r.profileId} ${r.version}`.toLowerCase().includes(search.toLowerCase())).map(r=><Card key={r.id} className="min-w-0 gap-0 py-0"><CardContent className="px-0 [&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6 [&_[data-slot=table-pagination]]:px-6 [&>div]:space-y-0"><DataTable variant="embedded" renderSearchToolbar={searchBox=><CardHeader className="flex flex-wrap items-start justify-between gap-3 pt-4 pb-3"><div className="min-w-0 flex-1 space-y-1"><CardTitle>{r.config.displayName} · {r.version}</CardTitle><CardDescription title={`${text("รหัสเวอร์ชัน", "Revision ID")}: ${r.id}`}>{r.profileId} · {text("โครงสร้าง", "Schema")} {r.config.schemaVersion} · {r.config.deviceType} · {r.config.pollGroups.join(', ')}</CardDescription></div><div className="flex w-full items-center justify-end gap-2 sm:w-auto">{searchBox}<Button type="button" className="h-10" variant="outline" onClick={()=>edit(r)}><Pencil data-icon="inline-start"/>{text("แก้ไข", "Edit")}</Button></div></CardHeader>} data={r.config.fields} getRowId={f=>f.tag} columns={[{accessorKey:'tag',header:'Tag'},{accessorKey:'displayName',header:text('ชื่อ','Name')},{accessorKey:'pollGroup',header:text('กลุ่ม','Group')},{accessorKey:'sourceUnit',header:text('ต้นทาง','Source unit')},{accessorKey:'targetUnit',header:text('ปลายทาง','Target unit')},{accessorKey:'conversion',header:text('การแปลง','Conversion')}]}/></CardContent></Card>)}
 <Dialog open={!!draft} onOpenChange={open=>{if(!open)closeEditor();}}>{draft && <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-none flex-col gap-4 max-sm:max-h-[90vh] max-sm:overflow-hidden sm:max-h-[90vh] sm:w-[80vw] sm:max-w-[80vw] sm:overflow-hidden"><DialogHeader className="shrink-0 pr-8"><DialogTitle>{creating?text("เพิ่มโปรไฟล์ข้อมูล", "Add payload profile"):text("สร้างเวอร์ชันใหม่", "Create a new revision")}</DialogTitle><DialogDescription>{text("กำหนดการแมปข้อมูลเท่านั้น ไม่รองรับสคริปต์", "Declarative mappings only. Executable scripts are unsupported.")}</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"><FieldGroup className="gap-4">
 <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
 {(['id','version','displayName','deviceType'] as const).map(key=><Field key={key}><FieldLabel htmlFor={`profile-${key}`}>{({id:text("รหัสโปรไฟล์", "Profile ID"),version:text("เวอร์ชัน", "Version"),displayName:text("ชื่อโปรไฟล์", "Profile name"),deviceType:text("ประเภทอุปกรณ์", "Device type")})[key]}</FieldLabel><Input id={`profile-${key}`} readOnly={key==='id' && !creating} placeholder={key==='version'?'1.0.0':key==='id'?'custom-meter-profile':key==='deviceType'?'energy-meter':text("ชื่อโปรไฟล์", "Profile name")} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></Field>)}
 <Field className="md:col-span-2"><FieldLabel htmlFor="profile-groups">{text("กลุ่มการอ่านค่า (คั่นด้วยจุลภาค)", "Poll groups (comma-separated)")}</FieldLabel><Input id="profile-groups" placeholder="realtime,energy" value={draft.pollGroups.join(',')} onChange={e=>setDraft({...draft,pollGroups:e.target.value.split(',').map(v=>v.trim())})}/></Field>
 </div>
 <PayloadFieldsEditor fields={draft.fields} onChange={fields=>setDraft({...draft,fields})} onAdd={()=>setDraft({...draft,fields:[...draft.fields,{tag:"",displayName:"",pollGroup:draft.pollGroups[0]??"",sourceUnit:"",targetUnit:"",conversion:"identity"}]})} />


 </FieldGroup></div>{error&&<p role="alert" className="shrink-0 text-destructive">{error}</p>}<DialogFooter className="shrink-0 gap-2"><Button type="button" disabled={busy} onClick={()=>void save()}>{text("เผยแพร่เวอร์ชันใหม่", "Publish new revision")}</Button><Button type="button" variant="outline" disabled={busy} onClick={closeEditor}>{text("ยกเลิก", "Cancel")}</Button></DialogFooter></DialogContent>}</Dialog>
 {error&&!draft&&<p role="alert" className="text-destructive">{error}</p>}
 </section>;
}
