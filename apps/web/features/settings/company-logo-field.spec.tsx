import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CompanyLogoField, readCompanyImage} from './company-logo-field';
import {CompanyProfileCard} from './company-profile-card';

let editing = false;
let logoUrl = 'data:image/png;base64,aGVsbG8=';

function companyMarkup(locale: 'th'|'en') {
  return renderToStaticMarkup(<CompanyProfileCard
    company={{id: 'private-company-id', companyName: 'Issuer', taxId: '1234567890123', branch: 'Head office', address: 'Address', phone: '02', email: 'billing@example.test', logoUrl}}
    locale={locale} editingCompany={editing} canEdit disabled={false} savingCompany={false}
    setCompany={()=>{}} onEdit={()=>{}} onCancel={()=>{}} onSave={()=>{}}/>);
}

test('company view shows the logo and document-use explanation in both languages', () => {
  editing = false;
  logoUrl = 'data:image/png;base64,aGVsbG8=';
  for (const locale of ['th', 'en'] as const) {
    const html = companyMarkup(locale);
    assert.match(html, locale === 'th' ? /ใช้ในเอกสารที่ออกจากระบบ.*ใบวางบิล/ : /Used on system-generated documents.*billing statements/);
    assert.match(html, locale === 'th' ? /alt="โลโก้บริษัท"/ : /alt="Company logo"/);
    assert.doesNotMatch(html, /ชื่อผู้ลงนาม|ตำแหน่งผู้ลงนาม|ลายเซ็นบริษัท|Default provider signatory|Default signatory title/);
    assert.doesNotMatch(html, /private-company-id/);
  }
});

test('company view explains how to add a missing logo', () => {
  editing = false;
  logoUrl = '';
  const html = companyMarkup('th');
  assert.match(html, /ยังไม่ได้อัปโหลดโลโก้/);
  assert.match(html, /แก้ไข/);
});

test('company edit contains legal facts and logo upload without signer configuration', () => {
  editing = true;
  const html = companyMarkup('en');
  assert.match(html, /id="company-companyName"/);
  assert.match(html, /id="company-logoUrl"/);
  assert.match(html, /Used on system-generated documents/);
  assert.doesNotMatch(html, /signatoryName|signatoryTitle|signatureDataUri|Default provider signatory|Default signatory title/);
  editing = false;
});

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
