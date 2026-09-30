/** Latest closed month becomes executable at 01:00 Asia/Bangkok on day 1. */
export function dueMonth(now:Date):{start:string;end:string}|null {
 const local=new Date(now.getTime()+7*3600_000);
 if(local.getUTCDate()===1 && local.getUTCHours()<1)return null;
 const year=local.getUTCFullYear(),month=local.getUTCMonth();
 return {start:new Date(Date.UTC(year,month-1,1)).toISOString().slice(0,10),end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10)};
}
/** Technical delivery policy: initial attempt + four retries (5m, 30m, 2h, 24h). */
export function retryAt(attempt:number,now:Date):Date|null {
 const delay=[5,30,120,1440][attempt-1];
 return delay===undefined?null:new Date(now.getTime()+delay*60_000);
}
export function reminderEligible(enabled:boolean,days:number[],overdue:number,status:string,pending:boolean):boolean {
 return enabled && !pending && !['paid','cancelled','void'].includes(status) && overdue>0 && days.includes(overdue);
}
export function settingValue(value:unknown):unknown {
 if(typeof value!=='string')return value;
 try{return JSON.parse(value);}catch{return null;}
}
