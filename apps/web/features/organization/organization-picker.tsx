'use client';
import * as React from 'react';
import { Pencil, Check } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { apiClient } from '../../lib/api-client';
import { OrganizationEditDialog } from './organization-edit-dialog';
import { organizationOptionIndex,filterOrganizations,generateOrganizationCode,selectOrganizationText,organizationDocumentComplete,type OrganizationDraft,type OrganizationRecord,type OrganizationSelection } from './organization-selection';

export interface OrganizationPickerProps {
 organizations:OrganizationRecord[];value:OrganizationSelection|null;onChange:(selection:OrganizationSelection|null)=>void;
 onRecordUpdated:(record:OrganizationRecord)=>void;locale:'th'|'en';canEdit:boolean;disabled?:boolean;
}
export function useOrganizationCatalog(open:boolean){
 const [organizations,setOrganizations]=React.useState<OrganizationRecord[]>([]),[error,setError]=React.useState('');
 React.useEffect(()=>{let active=true;if(open){setError('');apiClient.get<OrganizationRecord[]>('/v1/schools').then(rows=>{if(active)setOrganizations(rows);}).catch(e=>{if(active){setOrganizations([]);setError(e instanceof Error?e.message:'Unable to load organizations');}});}return()=>{active=false;};},[open]);
 const update=React.useCallback((record:OrganizationRecord)=>setOrganizations(rows=>rows.map(row=>row.id===record.id?record:row)),[]);
 return {organizations,error,onRecordUpdated:update};
}
export function OrganizationPicker({organizations,value,onChange,onRecordUpdated,locale,canEdit,disabled=false}:OrganizationPickerProps){
 const inputId=React.useId(),listId=React.useId();
 const [query,setQuery]=React.useState(value?.organization.name??''),[expanded,setExpanded]=React.useState(false),[activeIndex,setActiveIndex]=React.useState(-1);
 const [editing,setEditing]=React.useState<OrganizationRecord|OrganizationDraft|null>(null);
 const newCode=React.useRef<string>('');
 const selectedId=value?.kind==='existing'?value.organization.id:null;
 React.useEffect(()=>{
  if(value===null){setQuery('');newCode.current='';}
  else if(value.kind==='existing')setQuery(value.organization.name);
 },[value?.kind,selectedId,value?.organization.name]);
 React.useEffect(()=>{
  if(selectedId){const record=organizations.find(o=>o.id===selectedId);if(record&&value?.organization!==record)onChange({kind:'existing',organization:record});}
 },[selectedId,organizations,onChange,value]);
 const matches=filterOrganizations(organizations,query);
 const select=(record:OrganizationRecord)=>{onChange({kind:'existing',organization:record});setQuery(record.name);setExpanded(false);setActiveIndex(-1);};
 const type=(text:string)=>{
  setQuery(text);setExpanded(true);setActiveIndex(-1);
  if(!newCode.current)newCode.current=generateOrganizationCode();
  const next=selectOrganizationText(organizations,text,value?.kind==='new'?value.organization.code:newCode.current);
  // Keep explicitly entered document defaults when refining a new draft name.
  onChange(next?.kind==='new'&&value?.kind==='new'?{kind:'new',organization:{...value.organization,...next.organization}}:next);
 };
 return <div className="space-y-2 sm:col-span-2" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setExpanded(false);}}>
  <Label htmlFor={inputId} required>{locale==='th'?'ชื่อองค์กร':'Organization name'}</Label>
  <div className="relative"><Input id={inputId} role="combobox" aria-expanded={expanded} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeIndex>=0?listId+'-'+activeIndex:undefined}
   value={query} disabled={disabled} placeholder={locale==='th'?'ค้นหาชื่อหรือรหัสองค์กร หรือระบุองค์กรใหม่':'Search name/code or enter a new organization'} onFocus={()=>setExpanded(true)} onChange={e=>type(e.target.value)}
   onKeyDown={e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setExpanded(true);setActiveIndex(i=>organizationOptionIndex(i,matches.length,e.key==='ArrowDown'?'down':'up'));}
    else if(e.key==='Enter'&&expanded){e.preventDefault();if(activeIndex>=0&&matches[activeIndex])select(matches[activeIndex]);else setExpanded(false);}
    else if(e.key==='Escape'){e.preventDefault();setExpanded(false);}
   }}/>
   {expanded&&!disabled&&<div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
    <div id={listId} role="listbox" aria-label={locale==='th'?'องค์กร':'Organizations'}>{matches.map((record,index)=><div key={record.id} className="flex items-center gap-1">
     <button type="button" role="option" id={listId+'-'+index} aria-selected={selectedId===record.id} className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted ${activeIndex===index?'bg-muted':''}`} onClick={()=>select(record)}>
      <Check className={`size-4 shrink-0 ${selectedId===record.id?'opacity-100':'opacity-0'}`}/><span className="min-w-0"><span className="block truncate">{record.name}</span><span className="block text-xs text-muted-foreground">{record.code}{!organizationDocumentComplete(record)?' · '+(locale==='th'?'ข้อมูลเอกสารไม่ครบ':'Incomplete document identity'):''}</span></span>
     </button>
     <Button type="button" size="icon" variant="ghost" disabled={!canEdit} aria-label={`${locale==='th'?'แก้ไของค์กร':'Edit organization'} ${record.name}`} onClick={()=>{setEditing(record);setExpanded(false);}}><Pencil className="size-4"/></Button>
    </div>)}</div>
    {value?.kind==='new'&&<p className="px-2 py-2 text-sm">{locale==='th'?'องค์กรใหม่: ':'New organization: '}{value.organization.name}</p>}
    {!matches.length&&!query&&<p className="p-2 text-sm text-muted-foreground">{locale==='th'?'พิมพ์ชื่อองค์กรใหม่เพื่อเริ่มต้น':'Enter a new organization name to begin'}</p>}
   </div>}
  </div>
  <Label htmlFor={inputId+'-code'} required>{locale==='th'?'รหัสองค์กร':'Organization code'}</Label>
  <div className="flex items-center gap-2"><Input id={inputId+'-code'} className="font-mono" value={value?.organization.code??''} readOnly={value?.kind==='existing'} disabled={disabled||!value}
   onChange={e=>{if(value?.kind==='new'){newCode.current=e.target.value;onChange({kind:'new',organization:{...value.organization,code:e.target.value}});}}}/>
   {value&&<Button type="button" variant="outline" disabled={disabled||(value.kind==='existing'&&!canEdit)} aria-label={locale==='th'?'แก้ไขข้อมูลหลักองค์กร':'Edit organization master'} onClick={()=>setEditing(value.organization)}><Pencil className="size-4"/></Button>}
  </div>
  {value?.kind==='new'&&<p className="text-sm text-muted-foreground">{locale==='th'?'สร้างองค์กรเมื่อบันทึกไซต์งานสำเร็จ':'Created when the site is saved'}</p>}
  {value&&!organizationDocumentComplete(value.organization)&&<p role="status" className="text-sm text-amber-700 dark:text-amber-400">{locale==='th'?'ข้อมูลเอกสารไม่ครบ — ตั้งค่าไซต์ได้ กรุณาระบุชื่อทางกฎหมาย เลขภาษี และที่อยู่ก่อนสร้างสัญญา':'Incomplete document identity — site setup is allowed. Add legal name, tax ID and billing address before creating a contract.'}</p>}
  {editing&&<OrganizationEditDialog open onOpenChange={open=>{if(!open)setEditing(null);}} organization={editing} locale={locale} onSave={record=>{
   if('id' in record){onRecordUpdated(record);if(selectedId===record.id)onChange({kind:'existing',organization:record});}
   else {onChange({kind:'new',organization:record});setQuery(record.name);newCode.current=record.code;}
  }}/>}
 </div>;
}
