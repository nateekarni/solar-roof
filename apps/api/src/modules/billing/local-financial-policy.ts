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
function decimal(value:bigint,scale:number):string {const source=value.toString().padStart(scale+1,'0');return `${source.slice(0,-scale)}.${source.slice(-scale)}`;}
export function calculateTestTotals(kwh:unknown,rate:unknown) {
 const energy=scaled(kwh,3),price=scaled(rate,4);const subtotal=(energy*price+50000n)/100000n;const tax=(subtotal*7n+50n)/100n;
 return {consumedKwh:decimal(energy,3),rate:decimal(price,4),subtotal:decimal(subtotal,2),tax:decimal(tax,2),total:decimal(subtotal+tax,2)};
}
export function requireTestSettlement(amounts:unknown[],total:unknown):void {
 const minor=(value:unknown)=>{if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw new Error('Amounts require whole satang');return scaled(value,2);};
 if(!amounts.length||amounts.some(value=>minor(value)<=0n)||amounts.reduce<bigint>((sum,value)=>sum+minor(value),0n)!==minor(total))throw new Error('Transfers must sum to the full invoice amount');
}
export function actualEnergyDifference(opening:unknown,closing:unknown):string { const start=scaled(opening,3),end=scaled(closing,3);if(end<start)throw new Error('Meter reset requires review');return decimal(end-start,3); }

