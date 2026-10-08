import { createHash } from 'node:crypto';
export const TEST_FINANCIAL_POLICY = Object.freeze({scope:'TEST',taxMode:'exclusive',taxPercent:7,withholding:false,kwhScale:3,rateScale:4,moneyScale:2,rounding:'half_up',receipt:'combined_test_tax_invoice',number:'typeYYYYMM0001',logo:'/brand/solar-roof-document.png'});
export const TEST_FINANCIAL_POLICY_HASH=createHash('sha256').update(JSON.stringify(TEST_FINANCIAL_POLICY)).digest('hex');
export function localFinancialBinding(env:Record<string,string|undefined>=process.env):string|null {
 if(!['development','test'].includes(env.NODE_ENV??'') || env.LOCAL_FINANCIAL_FIXTURE_MARKER!=='solar-financial-flow-review-v1' || env.SMTP_HOST!=='127.0.0.1' || env.SMTP_PORT!=='11049')return null;
 try {const url=new URL(env.DATABASE_URL??''); if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15449'||url.pathname!=='/solar_financial_flow_review')return null;return createHash('sha256').update('127.0.0.1:15449/solar_financial_flow_review|solar-financial-flow-review-v1|127.0.0.1:11049').digest('hex');}catch{return null;}
}
function scaled(value:unknown,scale:number):bigint {
 const source=String(value); if(!/^\d+(\.\d+)?$/.test(source))throw new Error('Explicit nonnegative decimal is required');
 const [whole,fraction='']=source.split('.'); const retained=fraction.padEnd(scale,'0').slice(0,scale);return BigInt(whole!)*10n**BigInt(scale)+BigInt(retained||'0')+(Number(fraction[scale]??0)>=5?1n:0n);
}
export function decimal(value:bigint,scale:number):string {const source=value.toString().padStart(scale+1,'0');return `${source.slice(0,-scale)}.${source.slice(-scale)}`;}
export function calculateTestTotals(kwh:unknown,rate:unknown) {
 const energy=scaled(kwh,3),price=scaled(rate,4);const subtotal=(energy*price+50000n)/100000n;const tax=(subtotal*7n+50n)/100n;
 return {consumedKwh:decimal(energy,3),rate:decimal(price,4),subtotal:decimal(subtotal,2),tax:decimal(tax,2),total:decimal(subtotal+tax,2)};
}
export function requireTestSettlement(amounts:unknown[],total:unknown):void {
 const minor=(value:unknown)=>{if(!/^\d+(\.\d{1,2}0*)?$/.test(String(value)))throw new Error('Amounts require whole satang');return scaled(value,2);};
 if(!amounts.length||amounts.some(value=>minor(value)<=0n)||amounts.reduce<bigint>((sum,value)=>sum+minor(value),0n)!==minor(total))throw new Error('Transfers must sum to the full invoice amount');
}
export function actualEnergyDifference(opening:unknown,closing:unknown):string {
 const parts=(value:unknown)=>{const raw=String(value);if(!/^\d+(\.\d+)?$/.test(raw))throw new Error('Explicit actual decimal reading required');const [whole,fraction='']=raw.split('.');return {digits:BigInt(whole!+fraction),scale:fraction.length};};
 const first=parts(opening),last=parts(closing),scale=Math.max(first.scale,last.scale);
 const start=first.digits*10n**BigInt(scale-first.scale),end=last.digits*10n**BigInt(scale-last.scale);if(end<start)throw new Error('Meter reset requires review');
 const delta=end-start;if(scale<=3)return decimal(delta*10n**BigInt(3-scale),3);const divisor=10n**BigInt(scale-3);return decimal((delta+divisor/2n)/divisor,3);
}

export function sqlCalendarPeriod(row:{starts?:string;ends?:string;period_start?:unknown;period_end?:unknown}) {
 if(!row.starts||!row.ends||!/^\d{4}-\d{2}-\d{2}$/.test(row.starts)||!/^\d{4}-\d{2}-\d{2}$/.test(row.ends)||row.starts>row.ends)throw new Error('SQL calendar strings required');return {start:row.starts,end:row.ends};
}




export function validFinancialDate(value:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function normalizeTestRateSchedule(rows:Array<{startDate:string;endDate?:string|null;rate:number}>) {
 if(!rows.length)throw new Error('Effective rate required');const sorted=[...rows].sort((a,b)=>a.startDate.localeCompare(b.startDate));
 return sorted.map((row,index)=>{
  const next=sorted[index+1];if(!validFinancialDate(row.startDate)||!Number.isFinite(row.rate)||row.rate<0||(row.endDate&&!validFinancialDate(row.endDate))||(next&&!validFinancialDate(next.startDate)))throw new Error('Valid effective dates and rates required');
  const endDate=row.endDate||(next?new Date(Date.parse(next.startDate)-86400000).toISOString().slice(0,10):null);
  if(endDate&&(endDate<row.startDate||(next&&new Date(Date.parse(endDate)+86400000).toISOString().slice(0,10)!==next.startDate)))throw new Error('Inclusive rate intervals must be continuous without overlap');
  return {startDate:row.startDate,endDate,rate:row.rate};
 });
}




export function requireTestTransferAmount(value:unknown):string {
 if(typeof value!=='string'&&typeof value!=='number')throw new Error('Positive whole-satang transfer amount required');
 const raw=String(value);if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error('Positive whole-satang transfer amount required');
 const [whole,fraction='']=raw.split('.');const normalized=BigInt(whole!).toString();if(normalized.length>16||BigInt(normalized+fraction.padEnd(2,'0'))<=0n)throw new Error('Positive transfer within numeric(24,8) required');return `${normalized}.${fraction.padEnd(2,'0')}`;
}