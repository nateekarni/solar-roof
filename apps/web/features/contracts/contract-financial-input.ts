export function financialContractInput(days:string,recipient:string) {
 if(!/^\d+$/.test(days)||!Number.isSafeInteger(Number(days))||Number(days)>3650)throw new Error('Enter payment term in calendar days (0–3650)');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient))throw new Error('Select a verified organization recipient');
 return {paymentTermDays:Number(days),recipientUserIds:[recipient]};
}
export function nextRateStart(date:string) {return new Date(Date.parse(date)+86400000).toISOString().slice(0,10);}
export function contractRatePayload(rows:Array<{startDate:string;endDate:string;rate:number|''}>) {
 const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 return rows.map((row,index)=>{
  const next=rows[index+1];if(!valid(row.startDate)||row.rate===''||!Number.isFinite(row.rate)||row.rate<0)throw new Error('Enter valid effective dates and rate');
  const endDate=row.endDate||(next?new Date(Date.parse(next.startDate)-86400000).toISOString().slice(0,10):null);
  if(endDate&&(!valid(endDate)||endDate<row.startDate))throw new Error('Invalid inclusive rate end');
  if(next&&(!endDate||next.startDate!==nextRateStart(endDate)))throw new Error('Rate periods must be continuous and cannot overlap');
  return {startDate:row.startDate,endDate,rate:row.rate};
 });
}

