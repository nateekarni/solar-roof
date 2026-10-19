import assert from 'node:assert/strict';
import test from 'node:test';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import {
  discoveredGatewaysQueryOptions,
  gatewayOnboardingKeys,
  invalidateGatewayOnboarding,
  registeredGatewaysQueryOptions,
} from './gateway-onboarding-api';

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
