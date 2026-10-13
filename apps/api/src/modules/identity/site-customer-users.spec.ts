import assert from 'node:assert/strict';
import test from 'node:test';
import {SiteCustomerUsersService} from './site-customer-users.service.js';
import {routeAllowed} from '../../common/auth/route-policy.js';
test('site user administration belongs to Owner business authority',()=>{
 for(const method of ['GET','POST','PUT','DELETE'])for(const role of ['admin','owner','customer_user','operator','accountant'])assert.equal(routeAllowed(role,method,'/v1/sites/a/customer-users/b'),role==='owner');
});
test('editing cannot target another customer or promote a non-customer user',async()=>{
 let target:any={id:'user',role:'customer_user',customer_id:'other'};let writes=0;
 const db:any={transaction:async(fn:any)=>fn({query:async(sql:string)=>{
  if(sql.includes('FROM users WHERE id=$1 FOR SHARE'))return {rows:[{role:'owner',status:'active'}]};
  if(sql.includes('FROM sites'))return {rows:[{customer_id:'customer'}]};
  if(sql.includes('FROM users WHERE id=$1 FOR UPDATE'))return {rows:[target]};
  writes++;return {rows:[]};
 }})};
 const service=new SiteCustomerUsersService(db,{} as any);
 await assert.rejects(()=>service.update('site','user',{displayName:'Test User'},'actor'),/not found/i);
 target={...target,role:'admin',customer_id:'customer'};
 await assert.rejects(()=>service.update('site','user',{displayName:'Test User'},'actor'),/not found/i);
 assert.equal(writes,0);
});
