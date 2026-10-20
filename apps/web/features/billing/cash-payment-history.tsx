import type {CashPaymentEntry} from '@solar/api-contracts';
import {formatTransferAmount} from './payment-input';

export function CashPaymentHistory({entries,locale}:{entries:CashPaymentEntry[];locale:'th'|'en'}){
 if(!entries.length)return null;
 const date=(value:string,withTime=false)=>new Intl.DateTimeFormat(locale==='th'?'th-TH':'en-US',{dateStyle:'long',timeZone:'Asia/Bangkok',...(withTime?{timeStyle:'short'}:{})}).format(new Date(withTime?value:`${value}T12:00:00+07:00`));
 return <section aria-label={locale==='th'?'รายการรับเงินสดวันนี้':'Cash received today'} className="space-y-3 border-t pt-4"><h3 className="font-semibold">{locale==='th'?'รายการรับเงินสดวันนี้':'Cash received today'}</h3><ul className="space-y-2">{entries.map(entry=><li key={entry.id} className="rounded-xl border border-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{entry.customerName} · {entry.siteName}</strong><strong className="tabular-nums">{formatTransferAmount(entry.amount)}</strong></div><p>{locale==='th'?'รอบบิล':'Cycle'} {entry.billingCycleId} · {locale==='th'?'ใบเสร็จ':'Receipt'} {entry.receiptNumber??'—'}</p><p className="text-muted-foreground">{locale==='th'?'รับโดย':'Recorded by'} {entry.recordedBy} · {date(entry.receivedAt)} · {date(entry.recordedAt,true)}</p>{entry.note&&<p>{entry.note}</p>}</li>)}</ul></section>;
}
