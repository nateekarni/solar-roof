export interface InsightBill {id:string;siteId:string;siteName:string;invoiceId?:string;invoiceNumber?:string;amount:string;approved:string;pendingReview:number;dueDate:string|null;periodStart:string;status:string}
const minor=(v:string)=>{if(!/^\d+(\.\d{1,2}0*)?$/.test(v))throw Error('Invalid stored monetary amount');const [a,b='']=v.split('.');return BigInt(a!)*100n+BigInt(b.padEnd(2,'0').slice(0,2));};
const money=(v:bigint)=>{const s=v.toString().padStart(3,'0');return s.slice(0,-2)+'.'+s.slice(-2);};
export function financialInsights(input:InsightBill[],range:{start:string;end:string;today:string;cashReceived:string}){
 const bills=input.filter(b=>!['cancelled','superseded','draft'].includes(b.status));let billed=0n,collected=0n,outstanding=0n,overdue=0n,awaiting=0n,settledCount=0,pendingReviewCount=0;
 const buckets=[{key:'not_due',amount:0n,count:0},{key:'1_7',amount:0n,count:0},{key:'8_30',amount:0n,count:0},{key:'31_60',amount:0n,count:0},{key:'over_60',amount:0n,count:0}];
 const period=bills.filter(b=>b.periodStart>=range.start&&b.periodStart<=range.end).sort((a,b)=>b.periodStart.localeCompare(a.periodStart)||a.id.localeCompare(b.id));
 const collectionStatuses=[{key:'paid',amount:0n,count:0},{key:'pending_review',amount:0n,count:0},{key:'overdue',amount:0n,count:0},{key:'awaiting_payment',amount:0n,count:0}];
 const cohortAging=buckets.map(bucket=>({...bucket}));
 let cohortOldestOverdueDays=0;
 for(const bill of period){
  const amount=minor(bill.amount),approved=minor(bill.approved),paid=approved>amount?amount:approved,remaining=amount-paid;
  collectionStatuses[0]!.amount+=paid;
  if(remaining===0n){collectionStatuses[0]!.count++;continue;}
  const days=bill.dueDate?Math.max(0,Math.floor((Date.parse(range.today)-Date.parse(bill.dueDate))/86400000)):0;
  cohortOldestOverdueDays=Math.max(cohortOldestOverdueDays,days);
  const status=collectionStatuses[Number(bill.pendingReview)>0?1:days>0?2:3]!;status.amount+=remaining;status.count++;
  const aging=cohortAging[days===0?0:days<=7?1:days<=30?2:days<=60?3:4]!;aging.amount+=remaining;aging.count++;
 }
 const periodInvoices={total:period.length,hasMore:period.length>20,items:period.slice(0,20).map(b=>{
  const amount=minor(b.amount),approved=minor(b.approved);
  return {id:b.id,siteId:b.siteId,siteName:b.siteName,invoiceId:b.invoiceId,invoiceNumber:b.invoiceNumber,periodStart:b.periodStart,dueDate:b.dueDate,status:b.status,amount:money(amount),approved:money(approved),remaining:money(amount>approved?amount-approved:0n)};
 })};
 const queue=bills.flatMap(b=>{const amount=minor(b.amount),paid=minor(b.approved),remaining=amount>paid?amount-paid:0n;const cohort=b.periodStart>=range.start&&b.periodStart<=range.end;if(cohort){billed+=amount;collected+=paid>amount?amount:paid;}if(remaining===0n){settledCount++;return [];}outstanding+=remaining;pendingReviewCount+=Number(b.pendingReview);const days=b.dueDate?Math.max(0,Math.floor((Date.parse(range.today)-Date.parse(b.dueDate))/86400000)):0;const bucket=days===0?0:days<=7?1:days<=30?2:days<=60?3:4;buckets[bucket]!.amount+=remaining;buckets[bucket]!.count++;if(days>0)overdue+=remaining;else awaiting+=remaining;return [{id:b.id,siteId:b.siteId,siteName:b.siteName,invoiceId:b.invoiceId,invoiceNumber:b.invoiceNumber,dueDate:b.dueDate,daysOverdue:days,remaining:money(remaining),pendingReview:Number(b.pendingReview)}];});
 return {cohortOldestOverdueDays,collectionStatuses:collectionStatuses.map(b=>({...b,amount:money(b.amount)})),cohortAging:cohortAging.map(b=>({...b,amount:money(b.amount)})),periodInvoices,asOf:range.today,cashReceived:money(minor(range.cashReceived)),cohortBilled:money(billed),cohortCollected:money(collected),cohortOutstanding:money(billed-collected),outstanding:money(outstanding),overdue:money(overdue),awaitingPayment:money(awaiting),settledCount,pendingReviewCount,aging:buckets.map(b=>({...b,amount:money(b.amount)})),workQueue:queue.sort((a,b)=>b.daysOverdue-a.daysOverdue||Number(b.remaining)-Number(a.remaining)).slice(0,12)};
}
