export interface EffectiveRate { startDate: string; endDate?: string | null; rate: number; }
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
/** Input dates are inclusive; persistence converts ends to exclusive boundaries. */
export function validateRateSchedule(rates: EffectiveRate[]): void {
  if (!rates.length) throw new Error('At least one effective rate is required');
  const sorted = [...rates].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  for (let i=0;i<sorted.length;i++) {
    const row=sorted[i]!;
    if (!validDate(row.startDate) || (row.endDate && (!validDate(row.endDate) || row.endDate < row.startDate))) throw new Error('Invalid effective rate dates');
    if (!Number.isFinite(row.rate) || row.rate < 0) throw new Error('Rate must be a finite non-negative number');
    const next=sorted[i+1];
    if (next && (!row.endDate || row.endDate >= next.startDate)) throw new Error('Effective rate intervals overlap');
  }
}
export function calculateMeterCharge(opening: unknown, closing: unknown, rate: unknown) {
  if ([opening,closing,rate].some(x=>x===null || x===undefined || x==='' || !Number.isFinite(Number(x)))) throw new Error('Actual opening and closing readings and effective rate are required');
  const start=Number(opening), end=Number(closing), price=Number(rate);
  if (start<0 || end<start || price<0) throw new Error('Invalid meter readings or rate; meter reset requires review');
  const consumedKwh=end-start;
  return {consumedKwh,amount:Math.round((consumedKwh*price+Number.EPSILON)*100)/100};
}

export function exclusiveEnd(date: string): string {
 if(!validDate(date)) throw new Error('Invalid inclusive end date');
 return new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
}
export function requirePaymentTerm(value: unknown): number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>3650) throw new Error('paymentTermDays must be an integer from 0 to 3650');
 return value;
}
export function requireFullSettlement(amounts: unknown[], total: unknown): void {
 const minor=(v:unknown)=>{const n=Number(v);if(v===null||v===undefined||v===''||!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error('Amounts require nonnegative whole satang');return Math.round(n*100);};
 if(!amounts.length||amounts.some(x=>minor(x)<=0)||amounts.reduce<number>((sum,x)=>sum+minor(x),0)!==minor(total)) throw new Error('Transfers must sum to the full invoice amount');
}
export function requireSeparateApprover(requester:string, approver:string):void {
 if(!approver||requester===approver)throw new Error('A different Owner or Accountant must approve corrections');
}
export function withinReadingTolerance(actual:string,target:string):boolean {
 return Math.abs(Date.parse(actual)-Date.parse(target))<=5*60000;
}
