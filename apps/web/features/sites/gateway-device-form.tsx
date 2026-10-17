'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {apiClient} from '../../lib/api-client';
import {useLocale} from '../../providers/locale-provider';
import {Button} from '../../components/ui/button';
import {Card,CardHeader,CardTitle,CardContent} from '../../components/ui/card';
import {DeviceProfileEditor} from './device-profile-editor';
import {newDeviceDraft,deviceProfilePayload,validateDeviceDraft} from './site-form-values';
import type {PayloadRevision} from './payload-contracts';

export function GatewayDeviceForm({siteId,onSaved}:{siteId:string;onSaved:()=>void}){
 const locale=useLocale(),th=locale==='th';
 const [draft,setDraft]=useState(newDeviceDraft),[presets,setPresets]=useState<PayloadRevision[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets').then(rows=>{if(active)setPresets(rows);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function save(event:FormEvent){event.preventDefault();const problem=validateDeviceDraft(draft,false,locale,true);if(problem){setError(problem);return;}setBusy(true);setError('');try{await apiClient.post(`/v1/sites/${siteId}/devices`,{name:draft.name,model:draft.model,serialNumber:draft.serialNumber,externalDeviceId:draft.externalDeviceId||undefined,expectedIntervalSeconds:draft.expectedIntervalSeconds,...deviceProfilePayload(draft)});setDraft(newDeviceDraft());onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Card><CardHeader><CardTitle>{th?'เพิ่มอุปกรณ์ของเกตเวย์':'Add gateway device'}</CardTitle></CardHeader><CardContent><form onSubmit={save} className="space-y-4"><DeviceProfileEditor value={draft} onChange={setDraft} revisions={presets} onCatalogChange={setPresets} locale={locale} showAdvanced={false}/>{error&&<p role="alert" className="text-destructive">{error}</p>}<Button type="submit" disabled={busy}>{th?'บันทึกอุปกรณ์':'Save device'}</Button></form></CardContent></Card>;
}
