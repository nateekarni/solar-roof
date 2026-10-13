import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { decodeCompanyImage } from './company-image.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
test('uploaded PNG preserves decoded bytes and normalizes the data URI', () => {
  const result = decodeCompanyImage(`data:image/png;base64,${png.toString('base64')}`, 'Logo');
  assert.ok(result);
  assert.deepEqual(result.bytes, png);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.dataUri, `data:image/png;base64,${png.toString('base64')}`);
});
test('uploaded JPEG preserves real JPEG bytes and MIME', async () => {
  const jpeg = await sharp({create:{width:1,height:1,channels:3,background:'#ffffff'}}).jpeg().toBuffer();
  const result = decodeCompanyImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`, 'Signature');
  assert.ok(result);
  assert.deepEqual(result.bytes, jpeg);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.dataUri, `data:image/jpeg;base64,${jpeg.toString('base64')}`);
});
test('uploads reject MIME mismatch, malformed base64, external and legacy URLs', () => {
  for (const value of [`data:image/jpeg;base64,${png.toString('base64')}`, 'data:image/png;base64,AA=', 'data:image/png;base64,!!!!', 'https://example.test/logo.png', '/brand/solar-roof-mark.png']) {
    assert.throws(() => decodeCompanyImage(value, 'Logo'), /Logo must/);
  }
});
test('decoded upload limit includes exactly 1 MiB and rejects an extra byte', () => {
  const bytes = Buffer.alloc(1_048_576); png.copy(bytes);
  assert.equal(decodeCompanyImage(`data:image/png;base64,${bytes.toString('base64')}`, 'Logo')?.bytes.length, 1_048_576);
  assert.throws(() => decodeCompanyImage(`data:image/png;base64,${Buffer.concat([bytes,Buffer.from([0])]).toString('base64')}`, 'Logo'), /Logo must/);
});
test('empty image explicitly removes an upload', () => {
  assert.equal(decodeCompanyImage('', 'Logo'), null);
});
