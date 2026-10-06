import assert from 'node:assert/strict';
import test from 'node:test';
import {SiteSchoolUsersService} from './site-school-users.service.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
test('site user administration is Admin only for reads and writes',()=>{
 for(const method of ['GET','POST','PUT','DELETE'])for(const role of ['admin','owner','school_user','operator','accountant'])assert.equal(routeAllowed(role,method,'/v1/sites/a/school-users/b'),role==='admin');
});
test('editing cannot target another school or promote a non-school user',async()=>{
 let target:any={id:'user',role:'school_user',school_id:'other'};let writes=0;
 const db:any={transaction:async(fn:any)=>fn({query:async(sql:string)=>{
  if(sql.includes('FROM users WHERE id=$1 FOR SHARE'))return {rows:[{role:'admin',status:'active'}]};
  if(sql.includes('FROM sites'))return {rows:[{school_id:'school'}]};
  if(sql.includes('FROM users WHERE id=$1 FOR UPDATE'))return {rows:[target]};
  writes++;return {rows:[]};
 }})};
 const service=new SiteSchoolUsersService(db,{} as any);
 await assert.rejects(()=>service.update('site','user',{displayName:'Test User'},'actor'),/not found/i);
 target={...target,role:'admin',school_id:'school'};
 await assert.rejects(()=>service.update('site','user',{displayName:'Test User'},'actor'),/not found/i);
 assert.equal(writes,0);
});
