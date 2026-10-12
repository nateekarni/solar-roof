export interface ListPeriod {from:string;to:string}
export function calendarDate(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function parseCalendarDate(value:string):Date|undefined{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
 const [year,month,day]=value.split('-').map(Number);
 const date=new Date(year!,month!-1,day!);
 return calendarDate(date)===value?date:undefined;
}
export function bangkokCalendarToday(){
 const values=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
 const value=(key:string)=>Number(values.find(part=>part.type===key)?.value);
 return new Date(value('year'),value('month')-1,value('day'));
}
export function validListPeriod(period:ListPeriod){return Boolean(parseCalendarDate(period.from)&&parseCalendarDate(period.to)&&period.from<=period.to);}
export function monthPeriod(year:number,first:number,last:number):ListPeriod{
 return {from:calendarDate(new Date(year,Math.min(first,last),1)),to:calendarDate(new Date(year,Math.max(first,last)+1,0))};
}
export function listPeriodPreset(key:'today'|'last7'|'thisMonth'|'lastMonth'|'last3',now=bangkokCalendarToday()):ListPeriod{
 const year=now.getFullYear(),month=now.getMonth();
 if(key==='today')return {from:calendarDate(now),to:calendarDate(now)};
 if(key==='last7')return {from:calendarDate(new Date(year,month,now.getDate()-6)),to:calendarDate(now)};
 if(key==='lastMonth')return monthPeriod(year,month-1,month-1);
 return monthPeriod(year,key==='last3'?month-2:month,month);
}
