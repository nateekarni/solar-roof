export function transferAmount(value:string):string {
 if(!/^\d+(\.\d{1,2})?$/.test(value))throw new Error('Enter a positive THB transfer amount with at most two decimal places.');
 const [whole,fraction='']=value.split('.'),normalized=BigInt(whole!).toString();if(normalized.length>16||BigInt(normalized+fraction.padEnd(2,'0'))<=0n)throw new Error('Enter a positive THB transfer amount within the supported range.');return `${normalized}.${fraction.padEnd(2,'0')}`;
}
function minor(value:string):bigint {if(!/^\d+(\.\d{1,2}0*)?$/.test(value))throw new Error('Whole-satang stored amount required');const [whole,fraction='']=value.split('.');return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2));}
function money(value:bigint):string {const raw=value.toString().padStart(3,'0');return `${raw.slice(0,-2)}.${raw.slice(-2)}`;}
export function pendingTransferTotal(payments:Array<{amount:string;status:string}>):string {return money(payments.filter(payment=>payment.status==='pending_verification').reduce((sum,payment)=>sum+minor(payment.amount),0n));}
export function formatTransferAmount(value:string):string {try{const [whole,fraction]=money(minor(value)).split('.');return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction}`;}catch{return value;}}