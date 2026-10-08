import type {DashboardSummaryDataPoint, DashboardSummaryResponse} from '@solar/api-contracts';
import { formatAppDate, formatAppDateRange } from "../../lib/date-format";
import type {Locale} from '@solar/i18n';
import { SchoolDashboard, type SchoolDashboardProps } from './school-dashboard';

export function BusinessProductionTrend({points,locale='th',charges=false}:{points:DashboardSummaryDataPoint[];locale?:Locale;charges?:boolean}) {
  const th=locale==='th';
  const title=charges?(th?'ยอดเรียกเก็บตามช่วงเวลา':'Billed amounts over time'):(th?'พลังงานที่ผลิตตามช่วงเวลา':'Production over time');
  const maximum=points.reduce((max,point)=>Number.isFinite(point.value)?Math.max(max,point.value):max,1);
  return <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-6" aria-label={title}>
    <h2 className="font-semibold">{title}</h2>
    {points.length===0?<p className="py-10 text-sm text-muted-foreground">{th?'ยังไม่มีข้อมูลในช่วงเวลาที่เลือก':'No data in this date range'}</p>:<div tabIndex={0} role="region" aria-label={title} className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {points.map(point=><div key={point.date} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 text-sm">
        <span>{formatAppDate(point.date,locale)}</span><div className="min-w-0"><span className="block break-words">{Number.isFinite(point.value)?point.value.toLocaleString(locale,{maximumFractionDigits:2}):(th?'ยังไม่มีข้อมูล':'Unavailable')} {charges?'THB':'kWh'}</span><div aria-hidden="true" className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{width:`${Number.isFinite(point.value)?Math.max(0,point.value)/maximum*100:0}%`}}/></div></div>
      </div>)}
    </div>}
    {!charges&&<p className="mt-4 text-xs text-muted-foreground">{th?'ข้อมูลจากช่วงเวลาที่มีการวัด หากข้อมูลขาด ยอดรวมอาจไม่ครบ':'Based on measured intervals. Missing readings may make totals incomplete.'}</p>}
  </section>;
}

export function BusinessDashboard({data,role,locale,periodControl,...schoolProps}:SchoolDashboardProps & {role:string}) {
  if(role==='school_user') return <SchoolDashboard data={data} locale={locale} periodControl={periodControl} {...schoolProps}/>;
  const th=locale==='th';const school=role==='school_user';
  const unknown=th?'ยังไม่มีข้อมูล':'Unavailable';
  const format=(value:number|null|undefined)=>value==null||!Number.isFinite(value)?unknown:value.toLocaleString(locale,{maximumFractionDigits:2});
  const financeLabel=school?(th?'ค่าไฟฟ้า':'Electricity charges'):(th?'ยอดรายได้ที่เรียกเก็บ':'Billed revenue');
  const cards=[{label:th?'พลังงานที่ผลิต':'Generated energy',value:format(data.stats.periodKwh),unit:'kWh'},
    {label:financeLabel,value:data.stats.billCount>0?format(data.stats.periodAmount):unknown,unit:'THB'},
    {label:th?'ใบแจ้งหนี้ที่ชำระแล้ว':'Paid invoices',value:data.stats.billCount>0?`${data.stats.paidBillCount} / ${data.stats.billCount}`:unknown,unit:''}];
  return <div className="content w-full min-w-0 space-y-5">
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-bold md:text-2xl">{th?'หน้าแรก':'Home'}</h1>
      {school&&<p className="mt-1 text-sm text-muted-foreground">{data.sites[0]?.schoolName||(th?'ยังไม่มีข้อมูลองค์กรที่ได้รับมอบหมาย':'Organization assignment unavailable')}</p>}
      <p className="mt-2 text-sm text-muted-foreground">{formatAppDateRange(data.range.start,data.range.end,locale)}</p></div><div className="max-w-full [&_button]:min-h-11">{periodControl}</div></header>
    {data.energyReadModel?.enabled&&data.energyReadModel.status==='preparing'&&<p role="status" className="rounded-xl bg-muted p-4 text-sm">{th?'กำลังอัปเดตยอดพลังงาน ยอดที่แสดงอาจยังไม่ครบ':'Energy totals are updating and may be incomplete.'}</p>}
    <section className="grid min-w-0 gap-4 md:grid-cols-3">{cards.map(card=><article key={card.label} className="min-w-0 rounded-xl border bg-card p-5"><h2 className="text-sm text-muted-foreground">{card.label}</h2><p className="mt-3 break-words text-2xl font-semibold">{card.value} <span className="text-sm font-normal">{card.value!==unknown?card.unit:''}</span></p>{card.unit==='THB'&&data.stats.billCount===0&&<p className="mt-2 text-sm text-muted-foreground">{th?'ยังไม่มีใบแจ้งหนี้ในช่วงเวลานี้':'No billing records in this period'}</p>}</article>)}</section>
    <section aria-label={th?'เอกสาร':'Documents'} className="grid gap-3 sm:grid-cols-3">{[{href:'/contracts',label:th?'สัญญา':'Contracts'},{href:'/billing',label:th?'ใบแจ้งหนี้':'Invoices'},{href:'/receipts',label:th?'ใบเสร็จรับเงิน':'Receipts'}].map(link=><a key={link.href} href={link.href} className="flex min-h-11 items-center rounded-xl border bg-card px-4 py-3 font-medium text-primary hover:bg-muted">{link.label} →</a>)}</section>
    {school&&<a href="/production" className="inline-flex min-h-11 items-center text-primary">{th?'ดูการผลิตไฟฟ้า':'View production'} →</a>}
    <div className={`grid min-w-0 gap-4 ${school?'':'lg:grid-cols-2'}`}><BusinessProductionTrend points={data.production} locale={locale}/>{!school&&<BusinessProductionTrend points={data.revenue} locale={locale} charges/>}</div>
  </div>;
}
