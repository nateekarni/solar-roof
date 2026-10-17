import assert from 'node:assert/strict';
import test from 'node:test';
import {siteServicePayload} from './site-service-payload';
const site={name:' Roof A ',capacity:0.25,externalSiteId:' S1 ',region:'',latitude:'13.75',longitude:'100.5'};
const customer={name:' Customer A ',code:'',legalName:'Legal name',taxId:'1234567890123',taxBranch:'00000',taxAddress:'Address',contactName:'Contact',phone:'0200',documentEmail:'bill@example.com'};
test('new site embeds all inline customer document fields and paired coordinates without technical setup',()=>{
 const payload=siteServicePayload(site,customer);
 assert.deepEqual(payload,{name:'Roof A',capacityMwp:0.25,externalSiteId:'S1',latitude:13.75,longitude:100.5,newOrganization:{...customer,name:'Customer A',code:undefined}});
 assert.equal('region' in payload,false);assert.equal('customerId' in payload,false);assert.equal('gatewayName' in payload,false);
});
test('blank coordinates are omitted and explicit zero coordinates remain zero',()=>{
 const blank=siteServicePayload({...site,latitude:' ',longitude:''},customer);
 assert.equal('latitude' in blank,false);assert.equal('longitude' in blank,false);
 const zero=siteServicePayload({...site,latitude:'0',longitude:'0'},customer);assert.equal(zero.latitude,0);assert.equal(zero.longitude,0);
});
test('coordinates require both finite values within geographic bounds',()=>{
 for(const [latitude,longitude] of [['13',''],['','100'],['91','100'],['13','181'],['NaN','100'],['Infinity','100'],['not a number','100']])assert.throws(()=>siteServicePayload({...site,latitude:latitude!,longitude:longitude!},customer),/coordinate|พิกัด/i);
 assert.equal(siteServicePayload({...site,latitude:'-90',longitude:'180'},customer).latitude,-90);
});
test('inline identity rejects empty customer name and invalid tax ID before sending',()=>{
 assert.throws(()=>siteServicePayload(site,{...customer,name:' '}),/customer|ลูกค้า/i);
 assert.throws(()=>siteServicePayload(site,{...customer,taxId:'123'}),/Tax ID|ภาษี/i);
});
test('embeds billing and service activation settings when provided',()=>{
 const payload=siteServicePayload(site,customer,{
  serviceStartDate:'2026-11-01',
  ratePerKwh:4.5,
  paymentTermDays:45,
  taxRate:7,
  pricesIncludeTax:true,
  taxConfirmed:true,
  remindersEnabled:true,
  reminderStartDays:10,
  reminderIntervalDays:5,
 });
 assert.equal(payload.serviceStartDate,'2026-11-01');
 assert.equal(payload.ratePerKwh,4.5);
 assert.equal(payload.paymentTermDays,45);
 assert.equal(payload.taxRate,7);
 assert.equal(payload.pricesIncludeTax,true);
 assert.equal(payload.taxConfirmed,true);
 assert.equal(payload.remindersEnabled,true);
 assert.equal(payload.reminderStartDays,10);
 assert.equal(payload.reminderIntervalDays,5);
});
test('validates tariff rate non-negativity',()=>{
 assert.throws(()=>siteServicePayload(site,customer,{ratePerKwh:-1}),/Tariff rate|อัตราค่าบริการ/i);
});

