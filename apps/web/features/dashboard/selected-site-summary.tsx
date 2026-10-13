import type {DashboardSummarySite, DashboardSiteContext} from '@solar/api-contracts';
import type {Locale} from '@solar/i18n';
import {formatAppDate, formatAppDateTime} from '../../lib/date-format';

export function SelectedSiteSummary({site,detail,locale,showTechnical}:{site:DashboardSummarySite;detail?:DashboardSiteContext|null|undefined;locale:Locale;showTechnical:boolean}) {
 const th=locale==='th';
 const label=(thai:string,english:string)=>th?thai:english;
 const date=(value:string|null|undefined)=>value?formatAppDate(value,locale):'—';
 const time=(value:string|null|undefined)=>value?formatAppDateTime(value,locale):label('ยังไม่มีข้อมูล','No recent data');
 const seconds=(value:number)=>`${value} ${label('วินาที','seconds')}`;
 const states:Record<string,string>={applied:label('ใช้การตั้งค่าแล้ว','Applied'),unpublished:label('ยังไม่ส่งการตั้งค่า','Not published'),pending:label('รอส่งการตั้งค่า','Pending'),published:label('ส่งการตั้งค่าแล้ว','Published'),acknowledged:label('ตอบรับแล้ว','Acknowledged')};
 const g=showTechnical?detail?.gateway:null,b=detail?.business;
 const fields=[
  [label('รหัสไซต์','Site code'),detail?.code??'—'],[label('ลูกค้า','Customer'),site.customerName],
  [label('กำลังติดตั้ง','Installed capacity'),`${site.capacityMwp} MWp`],[label('ภูมิภาค','Region'),detail?.region??'—'],
  [label('สถานะการตั้งค่าไซต์','Site configuration status'),detail?.status??'—'],
  ...(g?[[label('Gateway','Gateway'),`${g.name} · ${g.code??'—'}`],[label('โพรโทคอล / Broker','Protocol / broker'),`${g.protocol} · ${g.brokerName??'—'}`],[label('Topic','Topic'),g.topic??'—'],[label('การตั้งค่า Gateway','Gateway configuration'),states[g.configurationState??'unpublished']??'—'],[label('รอบรับข้อมูล','Expected interval'),seconds(g.interval)],[label('Gateway ติดต่อครั้งล่าสุด','Gateway last seen'),time(g.lastSeenAt)]]:showTechnical?[[label('Gateway','Gateway'),label('ยังไม่ได้ตั้งค่า','Not configured')]]:[]),
  ...(b?[[label('อัตราค่าไฟ','Electricity rate'),b.rate===null?'—':`${b.rate} ${label('บาท/kWh','THB/kWh')}`],[label('วันที่เริ่มใช้เรต','Rate effective date'),date(b.rateFrom)],[label('วันเริ่มบริการ','Service start'),date(b.serviceStartDate)],[label('กำหนดชำระ','Payment term'),`${b.paymentTermDays} ${label('วัน','days')}`],[label('ภาษี','Tax'),`${b.taxRate??'—'}%`],[label('แจ้งเตือนชำระ','Payment reminders'),b.remindersEnabled?label(`เริ่ม ${b.reminderStartDays} วัน ทุก ${b.reminderIntervalDays} วัน`,`After ${b.reminderStartDays} days, every ${b.reminderIntervalDays} days`):label('ปิด','Disabled')]]:[])
 ];
 return <section aria-label={label('ข้อมูลไซต์งานที่เลือก','Selected site configuration')} className="min-w-0 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words text-xl font-semibold">{site.name}</h2><span className="text-sm">{site.status==='online'?label('ออนไลน์','Online'):label('ไม่มีข้อมูลล่าสุด','No recent data')}</span></div>
  <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">{fields.map(([key,value])=><div key={key} className="min-w-0 text-sm"><dt className="text-muted-foreground">{key}</dt><dd className="mt-1 break-words [overflow-wrap:anywhere] font-medium">{value}</dd></div>)}</dl>
  {showTechnical&&<div className="mt-4 border-t border-warning/30 pt-4"><h3 className="text-sm font-semibold">{label('มิเตอร์และอุปกรณ์','Meters and devices')} · {detail?.devices.length??0}</h3><div className="mt-3 grid gap-4 lg:grid-cols-2">{detail?.devices.map(d=><div key={d.id} className="min-w-0 text-sm"><p className="break-words font-medium">{d.name} · {d.billingSource?label('แหล่งข้อมูลเรียกเก็บเงิน','Billing source'):label('ข้อมูลประกอบ','Additional source')}</p><p className="mt-1 break-words text-muted-foreground">{label('รุ่น / รหัส','Model / code')}: {d.model??'—'} / {d.code??'—'} · Profile {d.profileVersion??'—'} · {seconds(d.interval)}</p><p className="mt-1 text-xs text-muted-foreground">{label('วัดล่าสุด','Last measured')}: {time(d.lastMeasuredAt)} · {label('รับล่าสุด','Last received')}: {time(d.lastReceivedAt)}</p></div>)}</div></div>}
 </section>;
}
