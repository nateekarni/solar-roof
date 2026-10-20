import {ConflictException} from '@nestjs/common';

function minor(value:string):bigint {
 if(!/^\d+(?:\.\d{1,8})?$/.test(value))throw new Error('Invalid decimal money');
 const [whole,fraction='']=value.split('.');
 const padded=fraction.padEnd(8,'0');
 if(/[1-9]/.test(padded.slice(2)))throw new Error('Money supports two decimal places');
 return BigInt(whole!)*100n+BigInt(padded.slice(0,2));
}
function money(value:bigint):string {
 const digits=value.toString().padStart(3,'0');
 return `${digits.slice(0,-2)}.${digits.slice(-2)}`;
}

export function settlementBalance(billed:string,approved:string[],incoming:string){
 const billedMinor=minor(billed);
 const paidBeforeMinor=approved.reduce((sum,value)=>sum+minor(value),0n);
 const paidAfterMinor=paidBeforeMinor+minor(incoming);
 if(paidAfterMinor>billedMinor)throw new ConflictException('Confirmed payments exceed the bill');
 return {
  paidBefore:money(paidBeforeMinor),
  paidAfter:money(paidAfterMinor),
  outstanding:money(billedMinor-paidAfterMinor),
  settled:paidAfterMinor===billedMinor,
 };
}

export function outstandingBalance(billed:string,approved:string[]):string {
 const billedMinor=minor(billed);
 const paid=approved.reduce((sum,value)=>sum+minor(value),0n);
 return money(billedMinor>paid?billedMinor-paid:0n);
}
