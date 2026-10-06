import assert from 'node:assert/strict';
import test from 'node:test';
import {authStore} from '../stores/auth-store';
import {syncSessionUser, fetchFinancialCapabilities} from './financial-session';
const user={id:'verified',email:'v@example.test',displayName:'Verified',role:'owner' as const};
test('Cookie-only identity requests financial capabilities with credentials',async()=>{
 authStore.clear();const original=globalThis.fetch;let requests=0;
 globalThis.fetch=async(_input,options)=>{requests++;assert.equal(options?.credentials,'include');assert.equal(new Headers(options?.headers).get('Authorization'),null);return Response.json({actions:['contracts.manage'],unavailable:{}});};
 try {const result=await fetchFinancialCapabilities(user);assert.ok(result.actions.includes('contracts.manage'));assert.equal(requests,1);assert.equal(authStore.getState().user?.id,'verified');}finally{globalThis.fetch=original;authStore.clear();}
});
test('Verified identity clears a token from another stored user before requesting capabilities',async()=>{
 authStore.setAuth({...user,id:'stale',role:'admin'},'stale-token');const original=globalThis.fetch;
 globalThis.fetch=async(_input,options)=>{assert.equal(new Headers(options?.headers).get('Authorization'),null);return Response.json({actions:[],unavailable:{}});};
 try{await fetchFinancialCapabilities(user);assert.equal(authStore.getState().user?.role,'owner');assert.equal(authStore.getState().accessToken,null);}finally{globalThis.fetch=original;authStore.clear();}
});
test('Sync retains a token only for the same verified account and replaces stale roles',()=>{
 authStore.setAuth({...user,role:'admin'},'same-account-token');syncSessionUser(user);
 assert.equal(authStore.getState().user?.role,'owner');assert.equal(authStore.getState().accessToken,'same-account-token');authStore.clear();
});
