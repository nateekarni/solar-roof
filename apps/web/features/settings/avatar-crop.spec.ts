import assert from 'node:assert/strict';
import test from 'node:test';
import { cropRectangle, validateAvatarFile } from './avatar-crop';
test('crop covers a square without reading outside the source, even at pan extremes',()=>{
 for(const [width,height] of [[800,400],[400,800],[400,400]]) for(const zoom of [1,2,4]) for(const pan of [-1,0,1]){
  const crop=cropRectangle(width!,height!,zoom,pan,-pan);
  assert.equal(crop.width,crop.height);assert.ok(crop.x>=0&&crop.y>=0);assert.ok(crop.x+crop.width<=width!&&crop.y+crop.height<=height!);
 }
 assert.deepEqual(cropRectangle(800,400,1,0,0),{x:200,y:0,width:400,height:400});
});
test('source avatar accepts bounded PNG/JPEG files only',()=>{
 assert.equal(validateAvatarFile({type:'image/jpeg',size:100}),true);
 assert.equal(validateAvatarFile({type:'image/png',size:5*1024*1024}),true);
 for(const file of [{type:'image/svg+xml',size:100},{type:'image/png',size:0},{type:'image/jpeg',size:5*1024*1024+1}])assert.equal(validateAvatarFile(file),false);
});
