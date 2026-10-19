import assert from 'node:assert/strict';
import test from 'node:test';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import {
  confirmGatewayWithoutCaching,
  discoveredGatewaysQueryOptions,
  gatewayOnboardingKeys,
  invalidateGatewayOnboarding,
  registeredGatewaysQueryOptions,
  approveGatewayProposal,
  rejectGatewayProposal,
} from './gateway-onboarding-api';

test('secret-returning confirmation bypasses TanStack mutation and query caches',async()=>{
  const originalFetch=globalThis.fetch;
  const response={
    gatewayId:'33333333-3333-4333-8333-333333333333',configVersion:1,configHash:'hash',
    credential:{username:'GW-001',password:'plain-secret-never-cache'},
    syncState:{gatewayId:'33333333-3333-4333-8333-833333333333',lifecycleState:'configuring',configState:'pending_sync',connectionState:'offline',desiredConfigVersion:1,desiredConfigHash:'hash',activeConfigVersion:null,activeConfigHash:null},
  } as const;
  let requestSignal:AbortSignal|null=null;
  globalThis.fetch=(async(_input,init)=>{requestSignal=init?.signal as AbortSignal;return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const controller=new AbortController();
  try{
    const result=await confirmGatewayWithoutCaching(client,'discovery-1',{discoveryRevision:1,siteId:'site-1',devices:[]},controller.signal);
    assert.equal(result.credential.password,'plain-secret-never-cache');
    assert.equal(requestSignal,controller.signal);
    assert.equal(client.getMutationCache().getAll().length,0);
    assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(query=>query.state.data)),/plain-secret-never-cache/);
  }finally{
    client.clear();
    globalThis.fetch=originalFetch;
  }
});

test('registered gateway reads and confirmation invalidation share the observed index key',async()=>{
  const client=new QueryClient();
  const options=registeredGatewaysQueryOptions();
  assert.deepEqual(options.queryKey,gatewayOnboardingKeys.registered());
  client.setQueryData(options.queryKey,[{id:'gw'}]);
  await invalidateGatewayOnboarding(client,'discovery','gateway');
  assert.equal(client.getQueryState(options.queryKey)?.isInvalidated,true);
  client.clear();
});

test('disabled discovery query does not call the admin-only endpoint',async()=>{
  const originalFetch=globalThis.fetch;
  let requests=0;
  globalThis.fetch=(async()=>{requests+=1;return new Response(JSON.stringify([]),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const observer=new QueryObserver(client,discoveredGatewaysQueryOptions(false));
  const unsubscribe=observer.subscribe(()=>{});
  await new Promise(resolve=>setTimeout(resolve,0));
  unsubscribe();
  client.clear();
  globalThis.fetch=originalFetch;
  assert.equal(requests,0);
});

test('proposal actions submit optimistic identity/base and reason then invalidate proposal and gateway state',async()=>{
  const originalFetch=globalThis.fetch,requests:Array<{url:string;body:unknown}>=[];
  globalThis.fetch=(async(input,init)=>{requests.push({url:String(input),body:JSON.parse(String(init?.body))});return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  const client=new QueryClient();
  client.setQueryData(gatewayOnboardingKeys.proposals('gw-1'),[{id:'p'}]);
  client.setQueryData(gatewayOnboardingKeys.sync('gw-1'),{configState:'applied'});
  client.setQueryData(gatewayOnboardingKeys.registered(),[{id:'gw-1'}]);
  try{
    await approveGatewayProposal(client,'gw-1','proposal-row',{expectedProposalId:'proposal-external',expectedBaseConfigVersion:4});
    await rejectGatewayProposal(client,'gw-1','proposal-row','wrong wiring');
    assert.deepEqual(requests.map(request=>request.body),[{expectedProposalId:'proposal-external',expectedBaseConfigVersion:4},{reason:'wrong wiring'}]);
    assert.ok(requests[0]!.url.endsWith('/v1/gateways/gw-1/config-proposals/proposal-row/approve'));
    assert.equal(client.getQueryState(gatewayOnboardingKeys.proposals('gw-1'))?.isInvalidated,true);
    assert.equal(client.getQueryState(gatewayOnboardingKeys.sync('gw-1'))?.isInvalidated,true);
    assert.equal(client.getQueryState(gatewayOnboardingKeys.registered())?.isInvalidated,true);
  }finally{client.clear();globalThis.fetch=originalFetch;}
});
