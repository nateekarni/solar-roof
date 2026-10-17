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

test('editing updates phone number for an existing customer user', async () => {
 let target: any = {
   id: 'user-1',
   role: 'customer_user',
   customer_id: 'customer',
   email: 'user@example.com',
   display_name: 'Original Name',
   phone: '0811111111',
   status: 'active',
   password_hash: 'hashed',
 };
 let updatedPhone: string | null = null;
 const db: any = {
   transaction: async (fn: any) =>
     fn({
       query: async (sql: string, params?: any[]) => {
         if (sql.includes('FROM users WHERE id=$1 FOR SHARE')) return { rows: [{ role: 'owner', status: 'active' }] };
         if (sql.includes('FROM sites')) return { rows: [{ customer_id: 'customer' }] };
         if (sql.includes('FROM users WHERE id=$1 FOR UPDATE')) return { rows: [target] };
         if (sql.includes('FROM site_account_assignments WHERE user_id=$1')) return { rows: [{ id: 'assign-1' }] };
         if (sql.includes('UPDATE users SET')) {
           updatedPhone = params?.[4];
           return { rows: [] };
         }
         return { rows: [] };
       },
     }),
 };
 const service = new SiteCustomerUsersService(db, {} as any);
 const result = await service.update('site', 'user-1', { phone: '0899999999' }, 'actor');
 assert.equal(result.phone, '0899999999');
 assert.equal(updatedPhone, '0899999999');
});

test('cancelInvite sets status to disabled and revokes invitations', async () => {
 let target: any = {
   id: 'user-2',
   role: 'customer_user',
   customer_id: 'customer',
   email: 'invitee@example.com',
   display_name: 'Invited User',
   phone: null,
   status: 'invited',
   password_hash: null,
 };
 let statusUpdated = false;
 let invitationRevoked = false;
 const db: any = {
   transaction: async (fn: any) =>
     fn({
       query: async (sql: string) => {
         if (sql.includes('FROM users WHERE id=$1 FOR SHARE')) return { rows: [{ role: 'owner', status: 'active' }] };
         if (sql.includes('FROM sites')) return { rows: [{ customer_id: 'customer' }] };
         if (sql.includes('FROM users WHERE id=$1 FOR UPDATE')) return { rows: [target] };
         if (sql.includes("UPDATE users SET status='disabled'")) {
           statusUpdated = true;
           return { rows: [] };
         }
         if (sql.includes('UPDATE user_invitations SET revoked_at=now()')) {
           invitationRevoked = true;
           return { rows: [] };
         }
         return { rows: [] };
       },
     }),
 };
 const service = new SiteCustomerUsersService(db, {} as any);
 const result = await service.cancelInvite('site', 'user-2', 'actor');
 assert.equal(result.status, 'disabled');
 assert.equal(statusUpdated, true);
 assert.equal(invitationRevoked, true);

 // Rejects if user is already active
 target.status = 'active';
 await assert.rejects(() => service.cancelInvite('site', 'user-2', 'actor'), /not in invited state/i);
});

