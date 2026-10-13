import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompanyLogoField, readCompanyImage} from './company-logo-field';

test('wrong MIME and oversized images are rejected before reading a preview',async()=>{
  for(const file of [new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'}),new File([new Uint8Array(1048577)],'logo.png',{type:'image/png'})]) {
    Object.assign(file,{arrayBuffer:()=>{throw new Error('Must not read invalid image');}});
    await assert.rejects(readCompanyImage(file,'en'),/PNG\/JPEG.*1 MB/);
  }
});
test('a valid selected image becomes a data URI and the upload remains labelled',async()=>{
  assert.equal(await readCompanyImage(new File([new Uint8Array([0xff,0xd8,0xff])],'logo.jpg',{type:'image/jpeg'}),'en'),'data:image/jpeg;base64,/9j/');
  const html=renderToStaticMarkup(<CompanyLogoField id="logo" purpose="logo" value="data:image/png;base64,aGVsbG8=" locale="en" onChange={()=>{}}/>);
  assert.match(html,/for="logo"/);
  assert.match(html,/accept="image\/png,image\/jpeg"/);
  assert.match(html,/alt="Company logo"/);
  assert.match(html,/Remove image/);
});
