import test from 'node:test';
import assert from 'node:assert/strict';
import { SettingsService } from '../src/modules/settings/settings.service.js';
function database() {
 const values=new Map<string,string>(); const writes:string[]=[];let failKey='';
 const query=async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('SELECT'))return {rows:[...values].map(([key,value])=>({key,value}))};
  const key=String(args[0]);writes.push(sql);
  if(key===failKey)throw Error('simulated database failure');
  if(sql.startsWith('DELETE'))values.delete(key);else values.set(key,String(args[1]));return {rows:[]};
 };
 return {values,writes,setFailKey:(key:string)=>{failKey=key;},query,transaction:async(work:(client:{query:typeof query})=>Promise<unknown>)=>{const before=new Map(values);try{return await work({query});}catch(error){values.clear();for(const [key,value]of before)values.set(key,value);throw error;}}};
}
test('default days distinguish unset and zero; settings edits never update contracts',async()=>{
 const db=database();const service=new SettingsService(db as any);
 assert.equal((await service.getSettings()).defaultPaymentTermDays,null);
 assert.equal((await service.updateSettings({defaultPaymentTermDays:0})).defaultPaymentTermDays,0);
 assert.equal((await service.updateSettings({defaultPaymentTermDays:30})).defaultPaymentTermDays,30);
 assert.equal((await service.updateSettings({defaultPaymentTermDays:null})).defaultPaymentTermDays,null);
 assert.ok(db.writes.every(sql=>!sql.includes('contracts')));
});
test('invalid terms and enabling absent reminder schedule leave all settings unchanged',async()=>{
 const db=database();const service=new SettingsService(db as any);
 for(const value of ['',-1,1.5,true])await assert.rejects(service.updateSettings({defaultPaymentTermDays:value} as any));
 await assert.rejects(service.updateSettings({defaultPaymentTermDays:15,financialRemindersEnabled:true}));assert.equal(db.values.size,0);
 await assert.rejects(service.updateSettings({financialRemindersEnabled:null} as any));
});
test('settings transaction rolls back partial writes and accepts explicit reminder schedule',async()=>{
 const db=database();const service=new SettingsService(db as any);db.setFailKey('financialReminderDays');
 await assert.rejects(service.updateSettings({defaultPaymentTermDays:10,financialRemindersEnabled:true,financialReminderDays:[3,7]}));assert.equal(db.values.size,0);
 db.setFailKey('');const result=await service.updateSettings({financialRemindersEnabled:true,financialReminderDays:[3,7]});assert.deepEqual(result.financialReminderDays,[3,7]);assert.equal(result.financialRemindersEnabled,true);
});
