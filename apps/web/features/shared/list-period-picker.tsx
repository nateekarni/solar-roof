'use client';
import * as React from 'react';
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react';
import type {DateRange} from 'react-day-picker';
import {Button} from '../../components/ui/button';
import {Calendar} from '../../components/ui/calendar';
import {ResponsivePopover} from '../../components/ui/responsive-popover';
import {useLocale} from '../../providers/locale-provider';
import {useIsMobile} from '../../hooks/use-mobile';
import {formatAppDateRange} from '../../lib/date-format';
import {bangkokCalendarToday,calendarDate,listPeriodPreset,monthPeriod,parseCalendarDate,validListPeriod,type ListPeriod} from './list-period-model';

/** Controlled range control; lists own their URL names, filtering and pagination. */
export function ListPeriodPicker({from='',to='',onValueChange}:{from?:string;to?:string;onValueChange:(period:ListPeriod)=>void}){
 const locale=useLocale(),th=locale==='th',mobile=useIsMobile();
 const [open,setOpen]=React.useState(false),[mode,setMode]=React.useState<'day'|'month'>('day');
 const [range,setRange]=React.useState<DateRange|undefined>();
 const [year,setYear]=React.useState(()=>bangkokCalendarToday().getFullYear());
 const [firstMonth,setFirstMonth]=React.useState<number|null>(null);
 const start=parseCalendarDate(from),end=parseCalendarDate(to);
 const draft=range?.from&&range.to?{from:calendarDate(range.from),to:calendarDate(range.to)}:null;
 function changeOpen(next:boolean){
  if(next){setRange({from:parseCalendarDate(from),to:parseCalendarDate(to)});setYear(parseCalendarDate(from)?.getFullYear()??bangkokCalendarToday().getFullYear());setFirstMonth(null);}
  setOpen(next);
 }
 function apply(period:ListPeriod){onValueChange(period);setOpen(false);}
 const label=start&&end?formatAppDateRange(start,end,locale):start?(th?'ตั้งแต่ ':'From ')+formatAppDateRange(start,start,locale):end?(th?'ถึง ':'Until ')+formatAppDateRange(end,end,locale):th?'ทุกช่วงเวลา':'All periods';
 const presets=[['today','วันนี้','Today'],['last7','7 วันล่าสุด','Last 7 days'],['thisMonth','เดือนนี้','This month'],['lastMonth','เดือนที่แล้ว','Last month'],['last3','3 เดือนล่าสุด','Last 3 months']] as const;
 return <ResponsivePopover open={open} onOpenChange={changeOpen} title={th?'เลือกช่วงเวลา':'Select period'} popoverClassName='w-auto max-w-[680px] rounded-2xl p-4' sheetClassName='max-h-[92vh] overflow-y-auto rounded-t-2xl p-4' trigger={<Button type='button' variant='outline' aria-label={th?'กรองช่วงเวลา':'Filter period'} className='h-10 gap-2'><CalendarDays className='size-4 text-muted-foreground'/><span className='max-w-[250px] truncate'>{label}</span></Button>}>
  <div className='space-y-4'>
   <div className='flex flex-wrap gap-2'>{presets.map(([key,thai,english])=><Button key={key} type='button' variant='outline' size='sm' onClick={()=>apply(listPeriodPreset(key))}>{th?thai:english}</Button>)}</div>
   <div className='flex gap-2' role='group' aria-label={th?'รูปแบบช่วงเวลา':'Period mode'}>{(['day','month'] as const).map(value=><Button key={value} type='button' variant={mode===value?'default':'outline'} aria-pressed={mode===value} onClick={()=>{setMode(value);setFirstMonth(null);}}>{value==='day'?(th?'วันที่':'Dates'):(th?'เดือน':'Months')}</Button>)}</div>
   {mode==='day'?<Calendar mode='range' selected={range} onSelect={setRange} numberOfMonths={mobile?1:2} defaultMonth={range?.from??bangkokCalendarToday()} />:<div className='mx-auto max-w-sm space-y-3'>
    <div className='flex items-center justify-between'><Button type='button' variant='outline' size='icon' aria-label={th?'ปีก่อนหน้า':'Previous year'} onClick={()=>{setYear(year-1);setFirstMonth(null);}}><ChevronLeft className='size-4'/></Button><span>{th?year+543:year}</span><Button type='button' variant='outline' size='icon' aria-label={th?'ปีถัดไป':'Next year'} onClick={()=>{setYear(year+1);setFirstMonth(null);}}><ChevronRight className='size-4'/></Button></div>
    <div className='grid grid-cols-4 gap-2'>{Array.from({length:12},(_,month)=>{const selected=Boolean(range?.from&&range?.to&&new Date(year,month+1,0)>=range.from&&new Date(year,month,1)<=range.to);return <Button key={month} type='button' variant={selected?'default':'outline'} aria-pressed={selected} onClick={()=>{const period=monthPeriod(year,firstMonth??month,month);setRange({from:parseCalendarDate(period.from),to:parseCalendarDate(period.to)});setFirstMonth(firstMonth===null?month:null);}}>{new Intl.DateTimeFormat(th?'th-TH':'en-US',{month:'short'}).format(new Date(year,month,1))}</Button>;})}</div>
   </div>}
   <div className='flex items-center justify-between gap-3 border-t pt-3'><Button type='button' variant='ghost' onClick={()=>apply({from:'',to:''})}>{th?'ทุกช่วงเวลา':'All periods'}</Button><Button type='button' disabled={!draft||!validListPeriod(draft)} onClick={()=>draft&&apply(draft)}>{th?'นำไปใช้':'Apply'}</Button></div>
  </div>
 </ResponsivePopover>;
}
