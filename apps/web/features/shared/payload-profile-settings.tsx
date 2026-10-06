'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '../../lib/api-client';
import {AppLoading} from '../../components/feedback/app-loading';
import {PresetPicker} from '../sites/preset-picker';
import type {PayloadRevision} from '../sites/payload-contracts';
import {Card,CardHeader,CardTitle,CardContent} from '../../components/ui/card';
import {DataTable} from '../../components/ui/data-table';
export function PayloadProfileSettings(){
 const [rows,setRows]=useState<PayloadRevision[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets').then(setRows).catch(e=>setError(e instanceof Error?e.message:'โหลด Preset ไม่สำเร็จ')).finally(()=>setLoading(false));},[]);
 const preset=rows.find(r=>r.id===selected);
 if(loading)return <AppLoading fullPage={false} message="กำลังโหลด Preset…"/>;
 return <section className="flex min-w-0 flex-col gap-4"><div><h2 className="text-lg font-semibold">Preset ข้อมูลอุปกรณ์</h2><p className="text-sm text-muted-foreground">เลือก Preset เพื่อดูรายการข้อมูล ใช้เมนู Edit / Delete ในรายการ หรือเพิ่ม Preset ด้วยตัวเอง การแก้ไขสร้าง Mapping version ใหม่</p></div><PresetPicker revisions={rows} value={selected} onChange={setSelected} onCatalogChange={setRows}/>{error&&<p role="alert" className="text-destructive">{error}</p>}{preset&&<Card><CardHeader><CardTitle>{preset.config.displayName} · Mapping {preset.version}</CardTitle><p className="text-sm text-muted-foreground">Source profile: {preset.config.sourceProfile?.id??preset.config.id} / {preset.config.sourceProfile?.version??preset.version} · {preset.config.deviceType}</p></CardHeader><CardContent><DataTable data={preset.config.fields} columns={[{accessorKey:'tag',header:'ความหมายมาตรฐาน'},{accessorKey:'sourceTag',header:'Field ต้นทาง',cell:({row})=>row.original.sourceTag??row.original.tag},{accessorKey:'displayName',header:'ชื่อแสดงผล'},{accessorKey:'pollGroup',header:'กลุ่ม'},{accessorKey:'sourceUnit',header:'หน่วยต้นทาง'},{accessorKey:'targetUnit',header:'หน่วยจัดเก็บ'},{accessorKey:'required',header:'จำเป็น',cell:({row})=>row.original.required?'ใช่':'ไม่'},{accessorKey:'role',header:'บทบาท'}]}/></CardContent></Card>}</section>;
}
