import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeAvatar } from './avatar-image.js';
test('normalizes bounded square PNG/JPEG to a metadata-free 256 pixel JPEG',async()=>{
 for(const format of ['png','jpeg'] as const){
 const bytes=await sharp({create:{width:256,height:256,channels:3,background:'#336699'}})[format]().toBuffer();
 const image=await normalizeAvatar(`data:image/${format};base64,${bytes.toString('base64')}`);
 assert.match(image,/^data:image\/jpeg;base64,/);const info=await sharp(Buffer.from(image.split(',')[1]!,'base64')).metadata();assert.equal(info.width,256);assert.equal(info.height,256);assert.equal(info.exif,undefined);
 }
});
test('rejects oversized, non-square, invalid, mismatched and unsupported image input',async()=>{
 const wide=await sharp({create:{width:400,height:256,channels:3,background:'red'}}).png().toBuffer();
 for(const image of [null,'data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,AAAA',`data:image/png;base64,${wide.toString('base64')}`,`data:image/jpeg;base64,${wide.toString('base64')}`,'data:image/png;base64,'+'A'.repeat(90000)])await assert.rejects(()=>normalizeAvatar(image));
});
