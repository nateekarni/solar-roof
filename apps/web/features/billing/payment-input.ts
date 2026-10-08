export function transferAmount(value:string):string {
 if(!/^\d+(\.\d{1,2})?$/.test(value))throw new Error('Enter a positive THB transfer amount with at most two decimal places.');
 const [whole,fraction='']=value.split('.'),normalized=BigInt(whole!).toString();if(normalized.length>16||BigInt(normalized+fraction.padEnd(2,'0'))<=0n)throw new Error('Enter a positive THB transfer amount within the supported range.');return `${normalized}.${fraction.padEnd(2,'0')}`;
}
function minor(value:string):bigint {if(!/^\d+(\.\d{1,2}0*)?$/.test(value))throw new Error('Whole-satang stored amount required');const [whole,fraction='']=value.split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2));}
function money(value:bigint):string {const raw=value.toString().padStart(3,'0');return `${raw.slice(0,-2)}.${raw.slice(-2)}`;}
export function pendingTransferTotal(payments:Array<{amount:string;status:string}>):string {return money(payments.filter(payment=>payment.status==='pending_verification').reduce((sum,payment)=>sum+minor(payment.amount),0n));}
export function formatTransferAmount(value:string):string {try{const [whole,fraction]=money(minor(value)).split('.');return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction}`;}catch{return value;}}
const BANGKOK_OFFSET=7*60*60*1000;
export function bangkokTransferWallTime(now:Date=new Date()):string {
 if(!Number.isFinite(now.getTime()))throw new Error('Valid transfer instant required');return new Date(now.getTime()+BANGKOK_OFFSET).toISOString().slice(0,16);
}
export function transferWallTimeToIso(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Valid Bangkok transfer date and time required');
 const instant=Date.parse(`${value}:00+07:00`);if(!Number.isFinite(instant)||bangkokTransferWallTime(new Date(instant))!==value)throw new Error('Valid Bangkok transfer date and time required');return new Date(instant).toISOString();
}