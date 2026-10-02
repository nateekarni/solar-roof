import React from 'react';
import type {JobRecord} from '@solar/api-contracts';
export function jobDownloadFilename(job:{id:string;kind:string}){return job.kind==='restore'?`history-${job.id}.jsonl.gz`:`report-${job.id}.csv`;}
export function HistorySummary({history,locale}:{history:NonNullable<JobRecord['history']>;locale:string}){
 return <div className="space-y-1 text-sm"><p>{locale==='th'?'ข้อมูลย้อนหลัง':'Archived detail'} · {history.from} – {history.to} · JSONL (.jsonl.gz)</p><p>{locale==='th'?'วันที่สิ้นสุดไม่รวมในคำขอ · ยังไม่ยืนยันเวลาประมวลผลสำหรับช่วงคำขอนี้':'End date is exclusive. Processing time for this request range has not been verified.'}</p></div>;
}
