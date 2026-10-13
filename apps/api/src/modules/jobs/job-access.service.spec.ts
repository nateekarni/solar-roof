import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JobAccessService} from './job-access.service.js';
test('legacy cached job access and queued execution fail closed after permission revocation',async()=>{
 const db:any={query:async()=>({rows:[{id:'old',created_by:'actor',kind:'report',payload:{type:'billing'}}]})};
 const access=new JobAccessService(db);
 await assert.rejects(()=>access.current('actor',{kind:'restore',created_by:'actor',payload:{siteId:'arbitrary'}}),/Legacy export/);
 await assert.rejects(()=>access.get('actor','old'),/Legacy export/);
});
