import {decimal} from './local-financial-policy.js';
export function scaledDecimal(value:unknown,scale:number):bigint {
 const raw=String(value);if(!/^\d+(\.\d+)?$/.test(raw))throw new Error('Explicit nonnegative decimal required');
 const [whole,fraction='']=raw.split('.');if(fraction.length>scale&&/[1-9]/.test(fraction.slice(scale)))throw new Error(`At most ${scale} decimal places required`);
 return BigInt(whole!)*10n**BigInt(scale)+BigInt(fraction.slice(0,scale).padEnd(scale,'0')||'0');
}
export function exactRate(value:unknown):string{return decimal(scaledDecimal(value,4),4);}
export function configuredTotals(gross:unknown,taxRate:unknown,inclusive:boolean){
 const amount=scaledDecimal(gross,2),percent=scaledDecimal(taxRate,4);if(percent>1000000n)throw new Error('Tax rate must be between 0 and 100');
 const base=inclusive?(amount*1000000n+(1000000n+percent)/2n)/(1000000n+percent):amount;
 const tax=inclusive?amount-base:(base*percent+500000n)/1000000n;
 return {subtotal:decimal(base,2),tax:decimal(tax,2),total:decimal(inclusive?amount:base+tax,2)};
}
export interface ManualLine {description:string;quantity:string|number;unitPrice:string|number;}
export function manualTotals(lines:ManualLine[],taxRate:unknown,inclusive:boolean){
 if(!Array.isArray(lines)||!lines.length||lines.length>200)throw new Error('One to 200 bill lines required');let total=0n;
 const items=lines.map(line=>{if(!line.description?.trim())throw new Error('Line description required');const quantity=scaledDecimal(line.quantity,3),price=scaledDecimal(line.unitPrice,4);if(!quantity)throw new Error('Positive quantity required');const amount=(quantity*price+50000n)/100000n;total+=amount;return {description:line.description.trim(),quantity:decimal(quantity,3),unitPrice:decimal(price,4),amount:decimal(amount,2)};});
 return {...configuredTotals(decimal(total,2),taxRate,inclusive),lines:items};
}
export function assertRateEditable(status:string,payments:Array<{status:string}>){if(['paid','cancelled'].includes(status)||payments.some(p=>['paid','pending_verification'].includes(p.status)))throw new Error('Bill is locked by settlement or transfer review');}
