'use client';
import {useEffect,useState} from 'react';
import {Layers,ArrowRight} from 'lucide-react';
import {apiClient} from '../../lib/api-client';
import {AppLoading} from '../../components/feedback/app-loading';
import {Button} from '../../components/ui/button';
import {PresetEditor} from '../sites/preset-editor';
import type {PayloadRevision} from '../sites/payload-contracts';
import {Card} from '../../components/ui/card';
import {DataTable} from '../../components/ui/data-table';
import {AddButton} from '../../components/ui/add-button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../../components/ui/dialog';
import {useLocale} from '../../providers/locale-provider';
import {useSessionUser} from '../../providers/session-user-provider';
export function PayloadProfileSettings(){
 const th=useLocale()==='th',user=useSessionUser();
 const [rows,setRows]=useState<PayloadRevision[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editor,setEditor]=useState<PayloadRevision|null|undefined>(undefined),[returnTo,setReturnTo]=useState('');
 useEffect(()=>{let active=true;apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets').then(data=>{if(active)setRows(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load profiles');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const preset=rows.find(r=>r.id===selected);
 const latest=[...rows].sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true})).filter((r,index,all)=>all.findIndex(other=>other.profileId===r.profileId)===index);
 return <section className="flex min-w-0 flex-col gap-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold md:text-2xl">{th?'ค่าจากมิเตอร์':'Meter values'}</h1><p className="mt-1 text-sm text-muted-foreground">{th?'จัดการโปรไฟล์ข้อมูลสำหรับอุปกรณ์':'Manage data profiles for devices'}</p></div>{user.role==='admin'&&<AddButton onClick={()=>{setReturnTo('');setEditor(null);}}>{th?'เพิ่มโปรไฟล์':'Add Profile'}</AddButton>}</div>
 {loading&&<AppLoading fullPage={false} message={th?'กำลังโหลดโปรไฟล์…':'Loading profiles…'}/>}
 {error&&<p role="alert" className="text-destructive">{error}</p>}
 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{latest.map(profile=><Card key={profile.id} className="overflow-hidden"><Button type="button" variant="ghost" className="h-auto! w-full flex-col items-stretch gap-3 whitespace-normal p-4 text-left" onClick={()=>setSelected(profile.id)}><div className="flex w-full items-start justify-between gap-3"><Layers className="size-7 text-primary"/><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">Mapping {profile.version}</span></div><h3 className="font-semibold">{profile.config.displayName}</h3><p className="break-all text-xs text-muted-foreground">{profile.config.deviceType}</p><div className="mt-auto flex w-full items-center justify-between text-sm"><span>{profile.config.fields.length} {th?'รายการ':'fields'}</span><ArrowRight className="size-4 text-primary"/></div></Button></Card>)}</div>
 {!loading&&!latest.length&&!error&&<div className="flex min-h-40 flex-col items-center justify-center gap-3 text-muted-foreground"><Layers className="size-7"/><p>{th?'ยังไม่มีโปรไฟล์':'No profiles available'}</p></div>}
 <Dialog open={!!preset} onOpenChange={opened=>{if(!opened)setSelected('');}}><DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-none flex-col sm:w-[80vw] sm:max-w-[80vw]"><DialogHeader><DialogTitle>{preset?.config.displayName}</DialogTitle><DialogDescription>{preset?.config.deviceType} · Mapping {preset?.version}</DialogDescription></DialogHeader><div className="min-h-0 space-y-4 overflow-y-auto"><div className="flex justify-end">{user.role==='admin'&&<Button variant="outline" onClick={()=>{setReturnTo(selected);setSelected('');setEditor(preset);}}>{th?'แก้ไขข้อมูลและ Fields':'Edit metadata & Fields'}</Button>}</div>{preset&&<DataTable data={preset.config.fields} columns={[{accessorKey:'tag',header:th?'มาตรฐาน':'Canonical tag'},{accessorKey:'sourceTag',header:th?'ต้นทาง':'Source field',cell:({row})=>row.original.sourceTag??row.original.tag},{accessorKey:'displayName',header:th?'ชื่อ':'Name'},{accessorKey:'pollGroup',header:'Group'},{accessorKey:'sourceUnit',header:'Source unit'},{accessorKey:'targetUnit',header:'Target unit'},{accessorKey:'required',header:th?'จำเป็น':'Required',cell:({row})=>row.original.required?(th?'ใช่':'Yes'):(th?'ไม่':'No')},{accessorKey:'role',header:th?'บทบาท':'Role'}]}/>}</div></DialogContent></Dialog>
 {editor!==undefined&&<PresetEditor catalog revision={editor} revisions={rows} onClose={()=>{setEditor(undefined);setSelected(returnTo);}} onSaved={saved=>{setRows(old=>[saved,...old.filter(row=>row.id!==saved.id)]);setSelected(saved.id);setEditor(undefined);}}/>}</section>;
}
