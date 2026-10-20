import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { GatewaySessionRevoker } from './gateway-session-revoker.js';

const brokerId='11111111-1111-4111-8111-111111111111';

test('kicks the exact EMQX client with API-key basic auth and accepts an already absent session',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const service=new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_URL:'https://emqx.example.test',EMQX_MANAGEMENT_API_KEY:'key',EMQX_MANAGEMENT_API_SECRET:'secret',EMQX_MANAGEMENT_DEFAULT_BROKER_ID:brokerId},
    fetch:async(url,init)=>{calls.push({url:String(url),init:init??{}});return new Response(null,{status:204});}});
  await service.kick(brokerId,'GW-001');
  assert.equal(calls[0]?.url,'https://emqx.example.test/api/v5/clients/GW-001');
  assert.equal(calls[0]?.init.method,'DELETE');
  assert.equal((calls[0]?.init.headers as Record<string,string>).authorization,`Basic ${Buffer.from('key:secret').toString('base64')}`);

  const absent=new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_URL:'https://emqx.example.test',EMQX_MANAGEMENT_API_KEY:'key',EMQX_MANAGEMENT_API_SECRET:'secret',EMQX_MANAGEMENT_DEFAULT_BROKER_ID:brokerId},
    fetch:async()=>new Response(null,{status:404})});
  await absent.kick(brokerId,'GW-001');
});

test('uses an explicit broker-id mapping and never places management secrets in the URL',async()=>{
  let observed='';
  const service=new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_BROKERS_JSON:JSON.stringify({[brokerId]:{url:'https://cluster.example.test/',apiKey:'mapped-key',apiSecret:'mapped-secret'}})},
    fetch:async(url)=>{observed=String(url);return new Response(null,{status:204});}});
  await service.kick(brokerId,'GW / 1');
  assert.equal(observed,'https://cluster.example.test/api/v5/clients/GW%20%2F%201');
  assert.ok(!observed.includes('mapped-key'));assert.ok(!observed.includes('mapped-secret'));
});

test('a remote broker UUID never falls back to an unrelated default management target',async()=>{
  let calls=0;
  const service=new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_URL:'https://default.example.test',EMQX_MANAGEMENT_API_KEY:'key',EMQX_MANAGEMENT_API_SECRET:'secret'},
    fetch:async()=>{calls++;return new Response(null,{status:204});}});
  await assert.rejects(service.kick(brokerId,'GW-001'),(error:unknown)=>error instanceof HttpException&&error.getStatus()===503);
  assert.equal(calls,0);
});

test('fails closed on missing configuration, unsafe URLs, timeout and non-success responses',async()=>{
  const cases=[
    new GatewaySessionRevoker({env:{},fetch:async()=>new Response(null,{status:204})}),
    new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_URL:'http://emqx.example.test',EMQX_MANAGEMENT_API_KEY:'key',EMQX_MANAGEMENT_API_SECRET:'secret'},fetch:async()=>new Response(null,{status:204})}),
    new GatewaySessionRevoker({env:{EMQX_MANAGEMENT_URL:'https://emqx.example.test',EMQX_MANAGEMENT_API_KEY:'key',EMQX_MANAGEMENT_API_SECRET:'secret'},fetch:async()=>new Response('sensitive',{status:500})}),
  ];
  for(const service of cases)await assert.rejects(service.kick(brokerId,'GW-001'),(error:unknown)=>error instanceof HttpException&&error.getStatus()===503);
});
