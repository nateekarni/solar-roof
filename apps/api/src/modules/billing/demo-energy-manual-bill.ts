import {scaledDecimal} from './site-billing-policy.js';

export interface DemoEnergyReading {
 id:string;valueKwh:string;sourceTime:string;meterId:string;deviceId:string;bindingId:string;profileRevisionId:string;
}
export interface DemoEnergyContext {
 siteId:string;siteCode:string;billingSettingsVersion:string;rateId:string;rate:string;dueDate:string;reading:DemoEnergyReading;
}
export interface DemoEnergyCheckpoint {
 cycleId:string;status:string;documentNumber:string|null;meterId:string;deviceId:string;bindingId:string;
 openingKwh:string;closingKwh:string;closingReadingId:string;closingSourceTime:string;
}
export interface DemoEnergyManualLine {
 description:string;quantity:string;unitPrice:string;
 demoEnergy:{
  version:1;siteCode:string;meterId:string;deviceId:string;bindingId:string;
  openingKwh:string;closingKwh:string;closingReadingId:string;closingSourceTime:string;
  openingReadingId:string|null;openingSourceTime:string|null;
 };
}
export interface DemoEnergyBillRepository {
 withSiteLock<T>(siteCode:string,work:()=>Promise<T>):Promise<T>;
 loadContext(siteCode:string):Promise<DemoEnergyContext>;
 findByClosingReading(siteId:string,readingId:string):Promise<DemoEnergyCheckpoint|null>;
 latestCheckpoint(siteId:string):Promise<DemoEnergyCheckpoint|null>;
 assertContinuous(context:DemoEnergyContext,prior:DemoEnergyCheckpoint):Promise<void>;
 createManualInvoice(input:{siteId:string;lines:DemoEnergyManualLine[];note:string;dueDate:string;idempotencyKey:string;demoEnergyPrecondition:{billingSettingsVersion:string;rateId:string;rate:string;meterId:string;deviceId:string;bindingId:string;profileRevisionId:string;closingReadingId:string;closingSourceTime:string;prior:DemoEnergyCheckpoint|null}},actorId:string):Promise<{cycle:{id:string;status:string}}>;
}
export interface DemoEnergyBillOptions {enabled:boolean;siteCode:string;firstBaseline?:string;actorId:string;}
export interface DemoEnergyBillResult {created:boolean;cycleId:string;status:string;openingKwh:string;closingKwh:string;consumedKwh:string;}

const format=(value:bigint,scale:number)=>{
 const padded=value.toString().padStart(scale+1,'0');
 return `${padded.slice(0,-scale)}.${padded.slice(-scale)}`;
};
const energy=(value:unknown)=>format(scaledDecimal(value,3),3);

export async function createDemoEnergyManualBill(options:DemoEnergyBillOptions,repository:DemoEnergyBillRepository):Promise<DemoEnergyBillResult>{
 if(!options.enabled)throw Error('Demo energy manual billing is disabled; set DEMO_ENERGY_MANUAL_BILL_ENABLED=true');
 if(!options.siteCode.trim())throw Error('Site code is required');
 if(!options.actorId)throw Error('Authenticated billing actor is required');
 return repository.withSiteLock(options.siteCode,async()=>{
  const context=await repository.loadContext(options.siteCode);
  const closing=energy(context.reading.valueKwh);
  const existing=await repository.findByClosingReading(context.siteId,context.reading.id);
  if(existing)return {created:false,cycleId:existing.cycleId,status:existing.status,openingKwh:existing.openingKwh,closingKwh:existing.closingKwh,consumedKwh:format(scaledDecimal(existing.closingKwh,3)-scaledDecimal(existing.openingKwh,3),3)};
  const prior=await repository.latestCheckpoint(context.siteId);
  let opening:string,openingReadingId:string|null=null,openingSourceTime:string|null=null;
  if(prior){
   if(options.firstBaseline!==undefined)throw Error('--first-baseline is allowed only before the first demo energy bill');
   if(!prior.documentNumber||!['approved','pending_verification','partially_paid','paid'].includes(prior.status))throw Error('Previous demo energy bill must be approved and issued before creating the next bill');
   if(prior.meterId!==context.reading.meterId||prior.deviceId!==context.reading.deviceId||prior.bindingId!==context.reading.bindingId)throw Error('Billing source changed since the previous demo bill; continuity review is required');
   const closingTime=Date.parse(context.reading.sourceTime),openingTime=Date.parse(prior.closingSourceTime);
   if(!Number.isFinite(closingTime)||!Number.isFinite(openingTime)||closingTime<=openingTime)throw Error('Latest telemetry timestamp is not newer than the previous demo checkpoint');
   await repository.assertContinuous(context,prior);
   opening=energy(prior.closingKwh);openingReadingId=prior.closingReadingId;openingSourceTime=prior.closingSourceTime;
  }else{
   if(options.firstBaseline===undefined)throw Error('First demo bill requires explicit --first-baseline=0');
   if(scaledDecimal(options.firstBaseline,3)!==0n)throw Error('The first demo baseline must be exactly zero');
   opening='0.000';
  }
  const difference=scaledDecimal(closing,3)-scaledDecimal(opening,3);
  if(difference<0n)throw Error('Meter reset or rollover detected; demo bill was not created');
  if(difference===0n)throw Error('No new billable energy since the previous demo bill');
  const consumed=format(difference,3);
  const line:DemoEnergyManualLine={
   description:`Demo ค่าไฟจริง ${opening} → ${closing} kWh`,quantity:consumed,unitPrice:context.rate,
   demoEnergy:{version:1,siteCode:context.siteCode,meterId:context.reading.meterId,deviceId:context.reading.deviceId,bindingId:context.reading.bindingId,openingKwh:opening,closingKwh:closing,closingReadingId:context.reading.id,closingSourceTime:context.reading.sourceTime,openingReadingId,openingSourceTime},
  };
  const result=await repository.createManualInvoice({siteId:context.siteId,lines:[line],note:'DEMO: ใบวางบิลจากส่วนต่างมิเตอร์สะสมจริง',dueDate:context.dueDate,idempotencyKey:`demo-energy-v1:${context.siteId}:${context.reading.id}`,demoEnergyPrecondition:{billingSettingsVersion:context.billingSettingsVersion,rateId:context.rateId,rate:context.rate,meterId:context.reading.meterId,deviceId:context.reading.deviceId,bindingId:context.reading.bindingId,profileRevisionId:context.reading.profileRevisionId,closingReadingId:context.reading.id,closingSourceTime:context.reading.sourceTime,prior}},options.actorId);
  return {created:true,cycleId:result.cycle.id,status:result.cycle.status,openingKwh:opening,closingKwh:closing,consumedKwh:consumed};
 });
}
