import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {OperationalAutomationService} from './operational-automation.service.js';
import type {DatabaseService} from '../../database/database.service.js';
test('technical tick evaluates rules while financial automation is disabled',async()=>{
 const old=process.env.FINANCIAL_WRITES_ENABLED;process.env.FINANCIAL_WRITES_ENABLED='false';
 try {
  const service=new OperationalAutomationService({} as DatabaseService);
  const calls:string[]=[];
  service.queueReminders=async()=>{calls.push('financial');};
  service.evaluateRules=async()=>{calls.push('technical');};
  service.deliver=async()=>{calls.push('delivery');};
  await service.tick();
  assert.deepEqual(calls,['technical','delivery']);
 } finally {if(old===undefined)delete process.env.FINANCIAL_WRITES_ENABLED;else process.env.FINANCIAL_WRITES_ENABLED=old;}
});
test('technical delivery never claims financial jobs when finance is disabled',async()=>{
 const old=process.env.FINANCIAL_WRITES_ENABLED;process.env.FINANCIAL_WRITES_ENABLED='false';
 try{
  const service=new OperationalAutomationService({} as DatabaseService);
  const claims:unknown[][]=[];
  service.reconcileClaims=async(...args)=>{claims.push(['reconcile',...args]);};
  service.claimDeliveries=async(...args)=>{claims.push(['claim',...args]);return [];};
  await service.deliver();
  assert.deepEqual(claims,[['reconcile','technical'],['claim','operational_delivery_outbox','technical']]);
 }finally{if(old===undefined)delete process.env.FINANCIAL_WRITES_ENABLED;else process.env.FINANCIAL_WRITES_ENABLED=old;}
});
test('missing technical SMTP preserves technical email retries even with all delivery scope',async()=>{
 const host=process.env.SMTP_HOST;delete process.env.SMTP_HOST;
 try{
  let sql='';
  const service=new OperationalAutomationService({transaction:async(work:any)=>work({query:async(statement:string)=>{sql=statement;return {rows:[]};}})} as DatabaseService);
  await service.claimDeliveries('operational_delivery_outbox','all');
  assert.match(sql,/channel='in_app' OR billing_cycle_id IS NOT NULL/);
 }finally{if(host!==undefined)process.env.SMTP_HOST=host;}
});
