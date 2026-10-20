import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService } from './gateway-credential.service.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';
import { GatewayConfigurationService } from './gateway-configuration.service.js';
import { GatewayOnboardingController } from './gateway-onboarding.controller.js';
import { AssetsController } from '../assets/assets.controller.js';

const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const admin = { user: { id: actor, role: 'admin' } };
const body = { discoveryRevision: 1, siteId: actor, devices: [] };
const http = (code: number) => (e: unknown) => e instanceof HttpException && e.getStatus() === code;
function fixture() {
  let reads = 0;
  const query = async (sql: string) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    reads++;
    if (/FROM discovered_gateways/.test(sql)) return { rows: [{ id, discovery_revision: 2, status: 'unassigned' }] };
    throw new Error('Unexpected database access');
  };
  const db = { query, transaction: DatabaseService.prototype.transaction,
    pool: { connect: async () => ({ query, release() {} }) } } as unknown as DatabaseService;
  const configuration = new GatewayConfigurationService(db, new GatewayCredentialService(db));
  return { controller: new GatewayOnboardingController(new GatewayRegistrationService(db), configuration),
    configuration, get reads() { return reads; } };
}

// Break caught: relying only on broad technical permission middleware would admit
// staff or an owner to credential/discovery administration.
for (const role of ['owner', 'operator', 'accountant', 'customer_user', undefined]) {
  test(`all onboarding endpoints require the actual admin role (${role})`, async () => {
    const f = fixture(); const request = { user: { id: actor, role } };
    for (const operation of [() => f.controller.list(undefined, request), () => f.controller.detail(id, request),
      () => f.controller.confirm(id, body, request), () => f.controller.syncState(id, request),
      () => f.controller.rotate(id, {}, request), () => f.controller.proposals(id, request),
      () => f.controller.adopt(id, {expectedDesiredConfigVersion:0,devices:[]}, request),
      () => f.controller.correct(id, {expectedBaseConfigVersion:1,expectedBaseConfigHash:'a'.repeat(64),devices:[]}, request),
      () => f.controller.approve(id, id, {}, request), () => f.controller.reject(id, id, { reason: 'wrong' }, request)]) {
      await assert.rejects(async () => operation(), http(403));
    }
    assert.equal(f.reads, 0);
  });
}

test('validates UUIDs, discovery filters and request shapes before reaching SQL', async () => {
  const f = fixture();
  const invalid = [() => f.controller.list('invalid', admin), () => f.controller.detail('invalid', admin),
    () => f.controller.confirm(id, { ...body, discoveryRevision: 0 }, admin),
    () => f.controller.confirm(id, { ...body, siteId: 'invalid' }, admin),
    () => f.controller.confirm(id, { ...body, unexpected: true }, admin),
    () => f.controller.syncState('invalid', admin), () => f.controller.rotate(id, { password: 'client-selected' }, admin),
    () => f.controller.proposals('invalid', admin), () => f.controller.approve(id, 'invalid', {}, admin),
    () => f.controller.adopt(id,{expectedDesiredConfigVersion:-1,devices:[]},admin),
    () => f.controller.correct(id,{expectedBaseConfigVersion:0,expectedBaseConfigHash:'bad',devices:[]},admin),
    () => f.controller.reject(id, id, { reason: ' ' }, admin)];
  for (const operation of invalid) await assert.rejects(async () => operation(), http(400));
  assert.equal(f.reads, 0);
});

test('adoption and initial correction validate then forward optimistic admin review fields',async()=>{
 const f=fixture();let adopted:unknown[]|undefined,corrected:unknown[]|undefined;
 f.configuration.adoptExisting=(async(...args:unknown[])=>{adopted=args;return {} as never;}) as typeof f.configuration.adoptExisting;
 f.configuration.correctInitialConfig=(async(...args:unknown[])=>{corrected=args;return {configVersion:2,configHash:'b'.repeat(64)};}) as typeof f.configuration.correctInitialConfig;
 const adoption={expectedDesiredConfigVersion:0,devices:[],billingContinuity:[{deviceId:'M1',expectedProfileRevisionId:id,expectedBillingSourceBindingId:id}]};
 const correction={expectedBaseConfigVersion:1,expectedBaseConfigHash:'a'.repeat(64),devices:[]};
 await f.controller.adopt(id,adoption,admin);await f.controller.correct(id,correction,admin);
 assert.deepEqual(adopted,[id,adoption,actor]);assert.deepEqual(corrected,[id,correction,actor]);
 await assert.rejects(f.controller.adopt(id,{...adoption,billingContinuity:[{...adoption.billingContinuity[0]!,expectedProfileRevisionId:'bad'}]},admin),http(400));
});

test('approval validates and forwards both optimistic concurrency fields', async () => {
  const f = fixture();
  let forwarded:unknown[]=[];
  f.configuration.approveProposal=(async(...args:unknown[])=>{forwarded=args;return {configVersion:2,configHash:'a'.repeat(64)};}) as typeof f.configuration.approveProposal;
  const expected={expectedProposalId:'proposal-1',expectedBaseConfigVersion:1};
  await f.controller.approve(id,id,expected,admin);
  assert.deepEqual(forwarded,[id,id,expected,actor]);
  for(const invalid of [
    {expectedProposalId:'proposal-1'},
    {expectedBaseConfigVersion:1},
    {...expected,expectedBaseConfigVersion:0},
    {...expected,unexpected:true},
  ])await assert.rejects(f.controller.approve(id,id,invalid,admin),http(400));
});

test('confirmation preserves service conflict status for a stale discovery revision', async () => {
  const f = fixture(); await assert.rejects(f.controller.confirm(id, body, admin),(error:unknown)=>{
    if(!(error instanceof HttpException)||error.getStatus()!==409)return false;
    assert.equal((error.getResponse() as {code?:string}).code,'GATEWAY_DISCOVERY_STALE');
    return true;
  });
  assert.equal(f.reads, 1);
});

test('onboarding owns the only discovery routes and the old assignment bypass is absent', () => {
  const routes = (controller: Function) => Object.getOwnPropertyNames(controller.prototype).flatMap(key => {
    const method = controller.prototype[key];
    const path = Reflect.getMetadata(PATH_METADATA, method);
    return path === undefined || key === 'constructor' ? [] : [{ path, method: Reflect.getMetadata(METHOD_METADATA, method) }];
  });
  const paths = routes(GatewayOnboardingController);
  assert.deepEqual(paths.filter(r => r.path === 'discovered'), [{ path: 'discovered', method: RequestMethod.GET }]);
  assert.deepEqual(paths.filter(r => r.path === 'discovered/:id/confirm'), [{ path: 'discovered/:id/confirm', method: RequestMethod.POST }]);
  assert.deepEqual(paths.filter(r=>r.path===':id/adopt'),[{path:':id/adopt',method:RequestMethod.POST}]);
  assert.deepEqual(paths.filter(r=>r.path===':id/configuration/correct'),[{path:':id/configuration/correct',method:RequestMethod.POST}]);
  assert.ok(!routes(AssetsController).some(r => /gateways\/(?:discovered|assign-discovered)/.test(r.path)));
  assert.ok(routes(AssetsController).some(r => r.path === 'sites/:id/payload-config'));
});
