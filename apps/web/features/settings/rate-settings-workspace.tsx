"use client";
import * as React from 'react';
import {apiClient} from '../../lib/api-client';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {DatePicker} from '../../components/ui/date-picker';
import {ChoiceSelect} from '../../components/ui/choice-select';
import {Checkbox} from '../../components/ui/checkbox';
import {DataTable} from '../../components/ui/data-table';
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from '../../components/ui/table';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from '../../components/ui/dropdown-menu';
import {MoreHorizontal} from 'lucide-react';
import type {ColumnDef} from '@tanstack/react-table';
import {pageSelection,togglePageSelection,pruneSelection,hiddenSelectionCount} from './rate-selection';
import {SearchInput} from '../../components/ui/search-input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {rateChangeInput} from '../billing/finance-workspace-input';
import {notify} from '../../components/feedback/notifications';
import {FormErrorSummary} from '../../components/feedback/form-feedback';
import {useLocale} from '../../providers/locale-provider';
type SiteRate={siteId:string;siteName:string;customerName:string;rate:string|null;history:Array<{id:string;rate:string;startDate:string;endDate:string|null;retiredAt:string|null}>};
type Catalog={id:string;name:string;rate:string};
type Preview={rate:string;effectiveDate:string;sites:Array<{siteId:string;siteName:string;rate:string|null;futureRates:Array<{rate:string;effective_from:string;effective_to:string|null}>|null;documents:string[]|null}>};
export function canConfirmRatePreview(preview:{sites:Array<{futureRates:unknown[]|null}>}|null,replaceFuture:boolean){
 return Boolean(preview?.sites.length&&(replaceFuture||!preview.sites.some(site=>site.futureRates?.length)));
}
export function rateDraftError(draft:{selection:'selected'|'matched'|'all';selected:string[];matched:string;rate:string;date:string;reason:string}){
 const decimal=(value:string)=>/^\d+(\.\d+)?$/.test(value)&&Number.isFinite(Number(value));
 if(draft.selection==='selected'&&!draft.selected.length)return 'selection';
 if(draft.selection==='matched'&&!decimal(draft.matched))return 'matched';
 if(!decimal(draft.rate))return 'rate';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)||!Number.isFinite(Date.parse(draft.date))||new Date(draft.date).toISOString().slice(0,10)!==draft.date)return 'date';
 if(!draft.reason.trim())return 'reason';
 return null;
}
export function RateSettingsWorkspace(){
 const th=useLocale()==='th',t=(thai:string,english:string)=>th?thai:english;
 const [sites,setSites]=React.useState<SiteRate[]>([]),[catalog,setCatalog]=React.useState<Catalog[]>([]),[search,setSearch]=React.useState(''),[filter,setFilter]=React.useState(''),[selected,setSelected]=React.useState<string[]>([]),[selection,setSelection]=React.useState<'all'|'matched'|'selected'>('selected'),[matched,setMatched]=React.useState(''),[rate,setRate]=React.useState(''),[date,setDate]=React.useState(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})),[reason,setReason]=React.useState(''),[replaceFuture,setReplace]=React.useState(false),[preview,setPreview]=React.useState<Preview|null>(null),[open,setOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[catalogName,setCatalogName]=React.useState(''),[catalogRate,setCatalogRate]=React.useState(''),[history,setHistory]=React.useState<SiteRate|null>(null),[manage,setManage]=React.useState(false),[creating,setCreating]=React.useState(false);
 const [loading,setLoading]=React.useState(true),[loadError,setLoadError]=React.useState('');
 const unit=t('บาท/kWh','THB/kWh');
 const failure=t('ดำเนินการไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง','Could not complete this request. Check the details and try again.');
 async function load(){setLoading(true);setLoadError('');try{const [s,c]=await Promise.all([apiClient.get<SiteRate[]>('/v1/site-rates'),apiClient.get<Catalog[]>('/v1/tariff-catalog')]);setSites(s);setCatalog(c);setSelected(ids=>pruneSelection(ids,s.map(site=>site.siteId)));}catch{setLoadError(t('โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง','Could not load rates. Please try again.'));}finally{setLoading(false);}}
 React.useEffect(()=>{void load();},[]);
 function changed(){setPreview(null);setReplace(false);setError('');}
 function edit(ids:string[]){setSelected(ids);setSelection('selected');setRate(ids.length===1?sites.find(s=>s.siteId===ids[0])?.rate||'':'');setReason('');setReplace(false);changed();setOpen(true);}
 async function save(apply=false){
  const invalid=rateDraftError({selection,selected,matched,rate,date,reason});
  if(invalid){const messages={selection:t('กรุณากลับไปเลือกไซต์จากตาราง หรือเปลี่ยนขอบเขตการปรับใช้','Go back and select sites from the table, or choose a different scope.'),matched:t('กรุณากรอกเรตปัจจุบันที่ต้องการจับคู่เป็นตัวเลขตั้งแต่ 0 ขึ้นไป','Enter a current rate to match as a number of zero or more.'),rate:t('กรุณากรอกเรตใหม่เป็นตัวเลขตั้งแต่ 0 ขึ้นไป','Enter a new rate as a number of zero or more.'),date:t('กรุณาระบุวันที่เริ่มใช้เรตที่ถูกต้อง','Choose a valid effective date.'),reason:t('กรุณาระบุเหตุผลในการเปลี่ยนเรต','Enter a reason for changing the rate.')};setError(messages[invalid]);return;}
  setBusy(true);setError('');try{const body=rateChangeInput(selection,selected,matched,rate,date,reason,replaceFuture);if(apply){await apiClient.post('/v1/site-rates/apply',body);notify.success(t('ปรับใช้เรตและบันทึกประวัติแล้ว','Rates applied and history saved'));setOpen(false);await load();}else setPreview(await apiClient.post<Preview>('/v1/site-rates/preview',body));}catch(e){setError(e instanceof Error && 'status' in e?e.message:failure);}finally{setBusy(false);}}
 async function addCatalog(){setBusy(true);setError('');try{await apiClient.post('/v1/tariff-catalog',{name:catalogName.trim(),rate:catalogRate});setCatalogName('');setCatalogRate('');setCreating(false);await load();}catch(e){setError(e instanceof Error && 'status' in e?e.message:failure);}finally{setBusy(false);}}
 const visible=React.useMemo(()=>sites.filter(s=>(!search||`${s.siteName} ${s.customerName}`.toLowerCase().includes(search.trim().toLowerCase()))&&(!filter||(s.rate!==null&&Number(s.rate)===Number(filter)))),[sites,search,filter]);
 const future=Boolean(preview?.sites.some(s=>s.futureRates?.length));
 const check=(site:SiteRate)=><Checkbox aria-label={t('เลือก ','Select ')+site.siteName} checked={selected.includes(site.siteId)} onCheckedChange={checked=>setSelected(ids=>togglePageSelection(ids,[site.siteId],checked===true))}/>;
 const actions=(site:SiteRate)=><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('เมนู ','Site actions: ')+site.siteName}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem onSelect={()=>edit([site.siteId])}>{t('แก้ไขเรตไซต์นี้','Edit site rate')}</DropdownMenuItem><DropdownMenuItem onSelect={()=>setHistory(site)}>{t('ประวัติเรต','Rate history')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>;
 const selectPage=(rows:SiteRate[]) => <Checkbox aria-label={t('เลือกไซต์ในหน้านี้','Select sites on this page')} disabled={!rows.length} checked={pageSelection(selected,rows.map(s=>s.siteId))} onCheckedChange={checked=>setSelected(ids=>togglePageSelection(ids,rows.map(s=>s.siteId),checked===true))}/>;
 const columns:ColumnDef<SiteRate>[]=[
  {
   id:'selection',
   size: 48,
   minSize: 48,
   maxSize: 48,
   enableSorting:false,
   enableHiding:false,
   header:({table})=><div className="flex items-center justify-center size-4 min-h-4 min-w-4 shrink-0 mx-auto">{selectPage(table.getRowModel().rows.map(row=>row.original))}</div>,
   cell:({row})=><div className="flex items-center justify-center size-4 min-h-4 min-w-4 shrink-0 mx-auto">{check(row.original)}</div>
  },
  {accessorKey:'siteName',header:t('ไซต์งาน','Site')},
  {accessorKey:'customerName',header:t('ลูกค้า','Customer')},
  {id:'rate',accessorFn:site=>site.rate===null?undefined:Number(site.rate),header:t('เรตปัจจุบัน','Current rate'),cell:({row})=>row.original.rate===null?t('ยังไม่กำหนด','Unassigned'):`${row.original.rate} ${unit}`},
  {id:'actions',enableSorting:false,header:()=> <span className="sr-only">{t('การดำเนินการ','Actions')}</span>,cell:({row})=>actions(row.original)},
 ];
 const hidden=hiddenSelectionCount(selected,visible.map(site=>site.siteId));
 return <main className="content flex flex-col gap-6">
  <header className="flex flex-wrap justify-between items-start gap-4"><div><h1 className="text-2xl font-semibold">{t('อัตราค่าไฟของไซต์งาน','Site electricity rates')}</h1><p className="text-muted-foreground text-sm mt-2">{t('เลือกไซต์และตรวจสอบผลกระทบก่อนปรับใช้เรตใหม่','Select sites and preview the impact before applying a new rate.')}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading||Boolean(loadError)} onClick={()=>{setError('');setManage(true);}}>{t('จัดการเรตต้นแบบ','Manage rate templates')}</Button><Button disabled={loading||Boolean(loadError)} onClick={()=>edit(selected)}>{t('ปรับใช้เรต','Apply rate')}</Button></div></header>
  {error&&!open&&!manage&&<FormErrorSummary>{error}</FormErrorSummary>}
  <section className="flex flex-col gap-4" aria-label={t('รายการไซต์และเรต','Sites and rates')}>
   <div className="flex flex-wrap items-center justify-between gap-3"><SearchInput className="max-w-md" aria-label={t('ค้นหาไซต์และลูกค้า','Search sites and customers')} placeholder={t('ค้นหาชื่อไซต์หรือลูกค้า','Search site or customer')} value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted-foreground" aria-live="polite">{t('เลือกแล้ว','Selected')}: {selected.length}{hidden>0&&` · ${t('ซ่อนโดยคำค้น/ตัวกรอง','Hidden by search/filter')}: ${hidden}`}</span>{selected.length>0&&<Button variant="ghost" size="sm" onClick={()=>setSelected([])}>{t('ล้างการเลือก','Clear selection')}</Button>}<ChoiceSelect className="w-[180px]" aria-label={t('กรองเรตปัจจุบัน','Filter current rate')} value={filter} onChange={e=>setFilter(e.target.value)}><option value="">{t('ทุกเรต','All rates')}</option>{[...new Set(sites.filter(s=>s.rate!==null).map(s=>String(Number(s.rate))))].map(r=><option key={r} value={r}>{r} {unit}</option>)}</ChoiceSelect></div></div>
   {loading?<p role="status">{t('กำลังโหลดอัตราค่าไฟ…','Loading electricity rates…')}</p>:loadError?<div className="flex flex-col items-start gap-3"><FormErrorSummary>{loadError}</FormErrorSummary><Button variant="outline" onClick={()=>void load()}>{t('ลองอีกครั้ง','Retry')}</Button></div>:<DataTable columns={columns} data={visible} getRowId={site=>site.siteId} hideSearch
    renderPageToolbar={rows=><label className="flex items-center gap-2 text-sm md:hidden">{selectPage(rows)}{t('เลือกไซต์ในหน้านี้','Select sites on this page')}</label>}
    emptyContent={<p className="py-6 text-center text-muted-foreground">{sites.length?t('ไม่พบไซต์ที่ตรงกับคำค้นหรือตัวกรอง','No sites match your search or filter'):t('ยังไม่มีไซต์งาน','No sites yet')}</p>}
    renderMobileRow={site=><article className="rounded-xl border bg-card p-4 flex flex-col gap-2"><div className="flex justify-between items-center gap-3"><label className="flex items-center gap-2 font-medium">{check(site)}{site.siteName}</label>{actions(site)}</div><p className="text-sm">{site.customerName}</p><p className="text-sm">{site.rate===null?t('ยังไม่กำหนด','Unassigned'):`${site.rate} ${unit}`}</p></article>}/>} 
  </section>
  <Dialog open={manage} onOpenChange={(v:boolean)=>{if(!busy){setManage(v);setError('');}}}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{t('จัดการเรตต้นแบบ','Manage rate templates')}</DialogTitle><DialogDescription>{t('ต้นแบบช่วยกรอกเรตเท่านั้น การสร้างต้นแบบไม่เปลี่ยนเรตของไซต์','Templates help fill in a rate. Creating a template does not change any site rate.')}</DialogDescription></DialogHeader>
   <div className="flex flex-col gap-3">{catalog.length?<ul className="divide-y rounded-lg border">{catalog.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><span className="font-medium break-words">{c.name}</span><span className="tabular-nums">{c.rate} {unit}</span></li>)}</ul>:<p className="text-muted-foreground text-sm">{t('ยังไม่มีเรตต้นแบบ','No rate templates yet')}</p>}
   {!creating?<Button variant="outline" onClick={()=>setCreating(true)}>{t('สร้างเรตต้นแบบ','Create rate template')}</Button>:<form className="flex flex-col gap-4 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void addCatalog();}}><h3 className="font-semibold">{t('สร้างเรตต้นแบบ','Create rate template')}</h3><label className="grid gap-2 text-sm">{t('ชื่อต้นแบบ','Template name')}<Input required disabled={busy} value={catalogName} onChange={e=>setCatalogName(e.target.value)}/></label><label className="grid gap-2 text-sm">{t('อัตราค่าไฟ','Electricity rate')} ({unit})<Input required inputMode="decimal" pattern="[0-9]+([.][0-9]+)?" disabled={busy} value={catalogRate} onChange={e=>setCatalogRate(e.target.value)}/></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>setCreating(false)}>{t('ยกเลิก','Cancel')}</Button><Button type="submit" disabled={busy||!catalogName.trim()||!catalogRate}>{t('บันทึกต้นแบบ','Save template')}</Button></div></form>}</div>
   {error&&<FormErrorSummary>{error}</FormErrorSummary>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setManage(false)}>{t('ปิด','Close')}</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={open} onOpenChange={(v:boolean)=>!busy&&setOpen(v)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{preview?t('ตรวจสอบผลกระทบก่อนปรับใช้','Review rate impact'):t('ปรับใช้เรตค่าไฟ','Apply electricity rate')}</DialogTitle><DialogDescription>{t('เรตเดิมจะสิ้นสุดก่อนวันที่เริ่มเรตใหม่ ใบวางบิลที่ออกแล้วจะไม่ถูกแก้โดยอัตโนมัติ','The previous rate ends before the new rate starts. Already issued bills will not change automatically.')}</DialogDescription></DialogHeader>
   <p className="text-sm text-muted-foreground">{preview?t('ขั้นตอน 2 จาก 2 · ตรวจสอบและยืนยัน','Step 2 of 2 · Review and confirm'):t('ขั้นตอน 1 จาก 2 · เลือกขอบเขต เรต และวันที่','Step 1 of 2 · Choose scope, rate and date')}</p>
   {!preview?<fieldset disabled={busy} className="flex flex-col gap-4"><label className="grid gap-2 text-sm">{t('ขอบเขต','Scope')}<ChoiceSelect disabled={busy} className="h-10 border rounded bg-background px-3" value={selection} onChange={e=>{setSelection(e.target.value as typeof selection);changed();}}><option value="selected">{t('ไซต์ที่เลือก','Selected sites')} ({selected.length})</option><option value="matched">{t('ไซต์ที่เรตปัจจุบันตรงกัน','Sites with a matching current rate')}</option><option value="all">{t('ทุกไซต์','All sites')}</option></ChoiceSelect></label>
    {selection==='selected'&&<p className="text-sm">{sites.filter(s=>selected.includes(s.siteId)).map(s=>s.siteName).join(', ')||t('เลือกไซต์จากตารางก่อน หรือเปลี่ยนขอบเขต','Select sites from the table first, or change the scope.')}</p>}
    {selection==='all'&&<p className="rounded border border-amber-300 p-3 text-sm">{t('จะปรับใช้กับทุกไซต์ กรุณาตรวจสอบรายชื่อทั้งหมดในขั้นตอนถัดไป','This applies to all sites. Review every affected site in the next step.')}</p>}
    {selection==='matched'&&<label className="grid gap-2 text-sm">{t('เรตปัจจุบันที่ต้องการเปลี่ยน','Current rate to match')}<Input inputMode="decimal" value={matched} onChange={e=>{setMatched(e.target.value);changed();}}/></label>}
    <label className="grid gap-2 text-sm">{t('ใช้เรตต้นแบบ','Use a rate template')}<ChoiceSelect disabled={busy} className="h-10 border rounded bg-background px-3" value={catalog.some(c=>c.rate===rate)?rate:''} onChange={e=>{setRate(e.target.value);changed();}}><option value="">{t('เลือกต้นแบบ หรือกรอกเรตด้านล่าง','Select a template or enter a rate below')}</option>{catalog.map(c=><option key={c.id} value={c.rate}>{c.name} ({c.rate} {unit})</option>)}</ChoiceSelect></label>
    <label className="grid gap-2 text-sm">{t('เรตใหม่','New rate')} ({unit})<Input inputMode="decimal" value={rate} onChange={e=>{setRate(e.target.value);changed();}}/></label><label className="grid gap-2 text-sm">{t('มีผลตั้งแต่','Effective from')}<DatePicker aria-label={t('มีผลตั้งแต่','Effective from')} disabled={busy} value={date} onChange={value=>{setDate(value);changed();}}/></label><label className="grid gap-2 text-sm">{t('เหตุผล','Reason')}<Input value={reason} onChange={e=>{setReason(e.target.value);changed();}}/></label>
   </fieldset>:<div className="flex flex-col gap-4"><div className="rounded-lg border bg-muted/30 p-4 text-sm flex flex-col gap-2"><p className="font-semibold">{t('ไซต์ที่ได้รับผลกระทบ','Affected sites')}: {preview.sites.length}</p><p>{t('ขอบเขต','Scope')}: {selection==='all'?t('ทุกไซต์','All sites'):selection==='matched'?`${t('เรตปัจจุบัน','Current rate')} ${matched}`:t('ไซต์ที่เลือก','Selected sites')}</p><p>{t('เรตใหม่','New rate')}: {preview.rate} {unit} · {t('มีผลตั้งแต่','Effective from')}: {preview.effectiveDate}</p><p>{t('เหตุผล','Reason')}: {reason}</p></div>
    <ul className="divide-y rounded-lg border">{preview.sites.map(s=><li key={s.siteId} className="p-4 text-sm flex flex-col gap-2"><p className="font-medium">{s.siteName}: {s.rate??t('ยังไม่กำหนด','Unassigned')} → {preview.rate} {unit}</p>{s.futureRates?.map((r,i)=><p key={i} className="text-amber-800 dark:text-amber-300">{t('เรตที่จะถูกแทนที่','Scheduled rate to replace')}: {r.rate} · {String(r.effective_from).slice(0,10)} – {r.effective_to?String(r.effective_to).slice(0,10):t('ไม่มีวันสิ้นสุด','No end date')}</p>)}<p>{t('เอกสารที่ออกแล้ว (ไม่เปลี่ยนแปลง)','Issued documents (unchanged)')}: {s.documents?.join(', ')||t('ไม่มี','None')}</p></li>)}</ul>
    {future&&<label className="flex gap-2 items-start rounded-lg border border-amber-300 p-4 text-sm"><Checkbox disabled={busy} checked={replaceFuture} onCheckedChange={checked=>setReplace(checked===true)}/>{t('ยืนยันแทนที่เรตที่ตั้งไว้ในอนาคตตามรายการข้างต้น โดยเก็บประวัติเดิม','Replace the scheduled rates listed above and retain their history.')}</label>}
   </div>}
   {error&&<FormErrorSummary>{error}</FormErrorSummary>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>preview?changed():setOpen(false)}>{preview?t('ย้อนกลับแก้ไข','Back to edit'):t('ยกเลิก','Cancel')}</Button><Button disabled={busy||Boolean(preview&&!canConfirmRatePreview(preview,replaceFuture))} onClick={()=>void save(Boolean(preview))}>{busy?t('กำลังดำเนินการ','Working…'):preview?t('ยืนยันปรับใช้','Confirm application'):t('ดูผลกระทบก่อนบันทึก','Preview impact')}</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={Boolean(history)} onOpenChange={(v:boolean)=>!v&&setHistory(null)}><DialogContent><DialogHeader><DialogTitle>{t('ประวัติเรต','Rate history')} · {history?.siteName}</DialogTitle><DialogDescription>{t('ช่วงเวลาการใช้เรตและรายการที่ถูกแทนที่','Rate periods and replaced entries')}</DialogDescription></DialogHeader><div className="overflow-x-auto"><Table className="bg-card w-full text-sm text-left"><TableHeader><TableRow><TableHead>{t('เรต','Rate')}</TableHead><TableHead>{t('เริ่ม','Start')}</TableHead><TableHead>{t('สิ้นสุด','End')}</TableHead><TableHead>{t('สถานะ','Status')}</TableHead></TableRow></TableHeader><TableBody>{history?.history.map(r=><TableRow key={r.id} className="border-b"><TableCell className="py-3">{r.rate}</TableCell><TableCell>{String(r.startDate).slice(0,10)}</TableCell><TableCell>{r.endDate?String(r.endDate).slice(0,10):t('ไม่มีวันสิ้นสุด','No end date')}</TableCell><TableCell>{r.retiredAt?t('ถูกแทนที่','Replaced'):t('ใช้งานตามช่วงเวลา','Applies during period')}</TableCell></TableRow>)}</TableBody></Table></div></DialogContent></Dialog>
 </main>;
}
