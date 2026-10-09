import React from 'react';
import type {DashboardSummaryResponse} from '@solar/api-contracts';

export function SummaryStatus({model,locale='th'}:{model:DashboardSummaryResponse['energyReadModel'];locale?:string}){
  if(!model?.enabled||model.status!=='preparing')return null;
  const date=model.watermark?new Date(model.watermark):null;
  const time=date&&Number.isFinite(date.getTime())?date.toLocaleString(locale==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'}):null;
  return <p role="status" className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-warning-emphasis ">
    {locale==='th'?'กำลังอัปเดตข้อมูลสรุป ยอดและกราฟบางส่วนยังไม่พร้อม กรุณารอการอัปเดตอัตโนมัติ':'Updating summaries. Some totals and charts are not ready; this page refreshes automatically.'}
    {time&&<span className="block">{locale==='th'?'ข้อมูลที่ประมวลผลแล้วถึง':'Processed data through'}: {time} (Asia/Bangkok)</span>}
  </p>;
}
