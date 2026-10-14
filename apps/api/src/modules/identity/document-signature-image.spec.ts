import assert from 'node:assert/strict';
import test from 'node:test';
import {BadRequestException} from '@nestjs/common';
import sharp from 'sharp';
import {normalizeDocumentSignature} from './document-signature-image.js';

test('accepts a bounded PNG signature and preserves transparency', async () => {
  const bytes = await sharp({create: {width: 400, height: 200, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).png().toBuffer();
  const value = await normalizeDocumentSignature(`data:image/png;base64,${bytes.toString('base64')}`);
  assert.match(value, /^data:image\/png;base64,/);
  const image = sharp(Buffer.from(value.split(',')[1]!, 'base64'));
  assert.equal((await image.metadata()).hasAlpha, true);
  assert.equal((await image.stats()).channels[3]!.max, 0);
});

test('accepts a JPEG signature at the maximum pixel count', async () => {
  const bytes = await sharp({create: {width: 1600, height: 800, channels: 3, background: '#ffffff'}}).jpeg().toBuffer();
  assert.equal(await normalizeDocumentSignature(`data:image/jpeg;base64,${bytes.toString('base64')}`), `data:image/jpeg;base64,${bytes.toString('base64')}`);
});

test('rejects animated PNG even when the decoder exposes only the first frame', async () => {
  // Two 1 x 1 RGBA frames (red, then blue), with valid APNG chunk checksums.
  const animatedPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAABAAAAAQAAAAAAAAAAAAEACgAAWn8w0AAAAA1JREFUeJxj+M/A8B8ABQAB/4mZPR0AAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAAEACgAAwQzaBAAAABFmZEFUAAAAAnicY2Bg+P8fAAMCAf/1e6XXAAAAAElFTkSuQmCC';
  await assert.rejects(() => normalizeDocumentSignature(animatedPng), BadRequestException);
});

test('rejects malformed, unsupported, oversized and corrupt signature images as bad requests', async () => {
  const png = await sharp({create: {width: 10, height: 10, channels: 4, background: '#00000000'}}).png().toBuffer();
  const tooManyPixels = await sharp({create: {width: 1601, height: 800, channels: 3, background: '#ffffff'}}).png().toBuffer();
  const gif = await sharp({create: {width: 10, height: 20, channels: 3, background: '#ffffff', pageHeight: 10}}).gif().toBuffer();
  const tooManyBytes = Buffer.concat([png, Buffer.alloc(256 * 1024)]);
  const inputs: unknown[] = [null, undefined, 12, '', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,',
    'data:image/png;base64,AAA', 'data:image/png;base64,AAAA====', 'data:image/png;base64,AAAA',
    `data:image/jpeg;base64,${png.toString('base64')}`, `data:image/png;base64,${gif.toString('base64')}`,
    `data:image/png;base64,${tooManyBytes.toString('base64')}`, `data:image/png;base64,${tooManyPixels.toString('base64')}`,
    `data:image/png;base64,${png.subarray(0, 40).toString('base64')}`, 'x'.repeat(350_001)];
  for (const input of inputs) {
    await assert.rejects(() => normalizeDocumentSignature(input), BadRequestException);
  }
});
