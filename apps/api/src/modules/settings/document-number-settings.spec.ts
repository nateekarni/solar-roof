import test from 'node:test';import assert from 'node:assert/strict';import {SettingsService} from './settings.service.js';
test('numbering settings show fixed current format and preserve historical custom settings',async()=>{
 const writes:unknown[]=[];const db={query:async(sql:string,params:unknown[]=[])=>{if(sql.includes('INSERT'))writes.push(params);return {rows:[{key:'invoicePrefix',value:'OLD-INV'},{key:'receiptPrefix',value:'OLD-RCT'}]};}};
 const service=new SettingsService(db as any);const settings=await service.updateSettings({invoicePrefix:'OTHER',receiptPrefix:'OTHER',language:'th'});
 assert.equal(settings.invoicePrefix,'INV{YY}{MM}');assert.equal(settings.receiptPrefix,'RCP{YY}{MM}');assert.deepEqual(writes,[['language','th']]);
});
