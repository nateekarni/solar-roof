import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {BadRequestException, UnauthorizedException} from '@nestjs/common';
import {routeAllowed} from '../../common/auth/route-policy.js';
import type {DatabaseService} from '../../database/database.service.js';
import {PersonalSignatureController} from './personal-signature.controller.js';

test('every authenticated role can save and remove only its own signature', async () => {
  const bytes = await sharp({create: {width: 400, height: 200, channels: 4, background: '#00000000'}}).png().toBuffer();
  const image = `data:image/png;base64,${bytes.toString('base64')}`;
  for (const role of ['owner', 'admin', 'operator', 'accountant', 'customer_user']) {
    const calls: Array<{sql: string; params: unknown[]}> = [];
    const controller = new PersonalSignatureController({query: async (sql: string, params: unknown[]) => {
      calls.push({sql, params});
      return {rows: [{id: 'actor'}]};
    }} as unknown as DatabaseService);
    const req = {user: {id: 'actor', role}};
    assert.equal(routeAllowed(role, 'PUT', '/v1/me/signature'), true);
    assert.deepEqual(await controller.save(req as never, {image}), {hasSignature: true, signatureDataUri: image});
    assert.deepEqual(await controller.save(req as never, {image: null}), {hasSignature: false});
    assert.deepEqual(calls.map(call => call.params), [[image, 'actor'], [null, 'actor']]);
    for (const call of calls) assert.match(call.sql, /WHERE id\s*=\s*\$2/);
    for (const key of ['id', 'userId', 'role', 'companyPosition']) {
      await assert.rejects(() => controller.save(req as never, {image: null, [key]: 'someone-else'}), BadRequestException);
    }
    assert.equal(calls.length, 2);
  }
});

test('signature changes reject unauthenticated requests and malformed bodies before storage', async () => {
  let writes = 0;
  const controller = new PersonalSignatureController({query: async () => {writes++; return {rows: [{id: 'actor'}]};}} as unknown as DatabaseService);
  await assert.rejects(() => controller.save({} as never, {image: null}), UnauthorizedException);
  for (const body of [null, undefined, [], {}, {image: undefined}, {image: ''}, {image: 4}, {image: 'data:image/png;base64,AAAA'}]) {
    await assert.rejects(() => controller.save({user: {id: 'actor'}} as never, body), BadRequestException);
  }
  assert.equal(writes, 0);
});

test('signature mutation rejects a missing user instead of reporting success', async () => {
  const controller = new PersonalSignatureController({query: async () => ({rows: []})} as unknown as DatabaseService);
  await assert.rejects(() => controller.save({user: {id: 'missing'}} as never, {image: null}), UnauthorizedException);
});
