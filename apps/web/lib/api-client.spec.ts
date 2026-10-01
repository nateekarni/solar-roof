import assert from 'node:assert/strict';
import test from 'node:test';
import {apiClient} from './api-client.js';
import {authStore} from '../stores/auth-store.js';
const user={id:'fixture',email:'fixture@example.test',displayName:'Fixture',role:'admin' as const};
test('mutation 401 from a controller cannot trigger refresh or replay',async()=>{
  const original=globalThis.fetch;const requests:string[]=[];authStore.setAuth(user,'old');
  globalThis.fetch=async(input)=>{requests.push(String(input));if(String(input).endsWith('/refresh'))return Response.json({user,accessToken:'new'});return Response.json({message:'Controller rejected mutation'},{status:401});};
  try {await assert.rejects(apiClient.post('/v1/contracts',{amount:10}));assert.equal(requests.length,1);} finally {globalThis.fetch=original;authStore.clear();}
});
test('concurrent guard-rejected mutations share one refresh and retry once with the new token',async()=>{
  const original=globalThis.fetch;let refreshes=0,writes=0;authStore.setAuth(user,'old');
  globalThis.fetch=async(input,options)=>{
    if(String(input).endsWith('/refresh')) {refreshes++;await new Promise(resolve=>setTimeout(resolve,10));return Response.json({user,accessToken:'new'});}
    if(new Headers(options?.headers).get('Authorization')==='Bearer old')return Response.json({message:'Expired'},{status:401,headers:{'X-Auth-Retry-Safe':'1'}});
    writes++;return Response.json({saved:true});
  };
  try {assert.deepEqual(await Promise.all([apiClient.post('/v1/contracts',{amount:10}),apiClient.post('/v1/contracts',{amount:20})]),[{saved:true},{saved:true}]);assert.equal(refreshes,1);assert.equal(writes,2);} finally {globalThis.fetch=original;authStore.clear();}
});
test('network failure and server errors never replay a mutation',async()=>{
  const original=globalThis.fetch;let calls=0;
  try {globalThis.fetch=async()=>{calls++;throw new Error('Connection closed');};await assert.rejects(apiClient.post('/v1/contracts',{}));assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json({message:'Error'},{status:500});};await assert.rejects(apiClient.post('/v1/contracts',{}));assert.equal(calls,1);
  } finally {globalThis.fetch=original;authStore.clear();}
});