import test from 'node:test';import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import sharp from 'sharp';
import type {Request} from 'express';
import {normalizeDocumentSignature} from '../modules/identity/document-signature-image.js';
import {requestJsonLimit, scopedJsonParser} from './body-limit.js';
test('evidence accepts10MiB encoded files while other endpoints retain bounded JSON',()=>{
 assert.ok(requestJsonLimit('/v1/billing-cycles/bill/pay')>Math.ceil(10*1024*1024/3)*4+4096);
 assert.equal(requestJsonLimit('/v1/billing-cycles/bill/verify-payment'),100*1024);
 assert.equal(requestJsonLimit('/v1/settings/company'),3*1024*1024);
});

async function parseJson(path: string, method: string, body: unknown): Promise<unknown> {
 const bytes = Buffer.from(JSON.stringify(body));
 const request = Object.assign(Readable.from([bytes]), {
  path, method, url: path,
  headers: {'content-type': 'application/json', 'content-length': String(bytes.length)},
 }) as unknown as Request;
 await new Promise<void>((resolve, reject) => {
  scopedJsonParser(request, {} as never, error => error ? reject(error) : resolve());
 });
 return request.body;
}

test('PUT signature parser accepts validator-approved image JSON above the default limit', async () => {
 const png = await sharp(randomBytes(256 * 128 * 4), {raw: {width: 256, height: 128, channels: 4}}).png().toBuffer();
 const image = `data:image/png;base64,${png.toString('base64')}`;
 assert.ok(Buffer.byteLength(JSON.stringify({image})) > 100 * 1024);
 assert.equal(await normalizeDocumentSignature(image), image);
 assert.deepEqual(await parseJson('/v1/me/signature', 'PUT', {image}), {image});
});

test('signature parser remains bounded and leaves other paths and methods at their existing limits', async () => {
 await assert.rejects(() => parseJson('/v1/me/signature', 'PUT', {image: 'x'.repeat(350 * 1024)}), {status: 413, type: 'entity.too.large'});
 for (const [path, method] of [
  ['/v1/me/signature', 'POST'], ['/v1/me/signature', 'GET'],
  ['/v1/me/signature/other', 'PUT'], ['/v1/me/profile', 'PUT'], ['/v1/me/avatar', 'PUT'],
 ]) {
  await assert.rejects(() => parseJson(path!, method!, {image: 'x'.repeat(100 * 1024)}), {status: 413, type: 'entity.too.large'});
 }
 assert.equal(requestJsonLimit('/v1/settings/company'), 3 * 1024 * 1024);
 assert.equal(requestJsonLimit('/v1/billing-cycles/bill/pay'), 14 * 1024 * 1024);
});
