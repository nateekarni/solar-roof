import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { SiteBillingService } from './site-billing.service.js';
import { effectiveAuthorization } from '../../common/auth/authorization.js';
test('financial service uses explicit live grant rather than employee job title',async()=>{
 const authorization=effectiveAuthorization('operator',1,[{domain:'business',preset:{'business.billing.view':true},overrides:{},scope:{mode:'selected',siteIds:['site']}}]);
 const db:any={query:async(sql:string)=>({rows:sql==='SELECT * FROM sites WHERE id=$1'?[{id:'site',customer_id:'customer'}]:[]})};
 const service=new SiteBillingService(db,{} as any);
 assert.equal((await service.settings('site',{role:'operator',authorization})).siteId,'site');
 await assert.rejects(()=>service.settings('other',{role:'operator',authorization}),/Forbidden/);
 await assert.rejects(()=>service.settings('site',{role:'accountant',authorization:effectiveAuthorization('accountant',2,[])}),/Forbidden/);
});
