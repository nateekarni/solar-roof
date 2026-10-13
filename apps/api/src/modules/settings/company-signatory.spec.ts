import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsService } from './settings.service.js';
import { settingsDatabase, testCompany } from './company-settings.test-fixtures.js';
test('company signatory defaults persist and unrelated edits preserve them',async()=>{
 const service=new SettingsService(settingsDatabase({...testCompany,signatoryName:'',signatoryTitle:''}).db);
 const updated=await service.updateCompanyProfile({signatoryName:'Provider Person',signatoryTitle:'Director'},'owner-a');
 assert.equal(updated.signatoryName,'Provider Person');assert.equal(updated.signatoryTitle,'Director');
 const later=await service.updateCompanyProfile({companyName:'Changed issuer'},'owner-a');assert.equal(later.signatoryName,'Provider Person');assert.equal(later.signatoryTitle,'Director');
 const cleared=await service.updateCompanyProfile({signatoryName:'',signatoryTitle:''},'owner-a');assert.equal(cleared.signatoryName,'');
});
test('signature upload is persisted as image bytes, preserved on unrelated updates and explicitly removable',async()=>{
 const service=new SettingsService(settingsDatabase().db);
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 assert.equal((await service.updateCompanyProfile({signatureDataUri:image},'owner-a')).signatureDataUri,image);
 assert.equal((await service.updateCompanyProfile({companyName:'Updated'},'owner-a')).signatureDataUri,image);
 assert.equal((await service.updateCompanyProfile({signatureDataUri:''},'owner-a')).signatureDataUri,'');
 await assert.rejects(()=>service.updateCompanyProfile({signatureDataUri:'https://example.test/latest-signature.png'},'owner-a'),/Signature must/);
});
