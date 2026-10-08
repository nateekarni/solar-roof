import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsService } from './settings.service.js';
test('company signatory defaults persist and unrelated edits preserve them',async()=>{
 let row:any={id:'company-a',companyName:'Issuer',taxId:'1234567890123',branch:'',address:'Address',phone:'',email:'',signatoryName:'',signatoryTitle:''};
 const service=new SettingsService({query:async(sql:string,p:any[]=[])=>{
  if(sql.includes('UPDATE company_profile')){row={...row,companyName:p[0],signatoryName:p[7],signatoryTitle:p[8]};return {rows:[]};}
  return {rows:[{...row}]};
 }} as any);
 const updated=await service.updateCompanyProfile({signatoryName:'Provider Person',signatoryTitle:'Director'});
 assert.equal(updated.signatoryName,'Provider Person');assert.equal(updated.signatoryTitle,'Director');
 const later=await service.updateCompanyProfile({companyName:'Changed issuer'});assert.equal(later.signatoryName,'Provider Person');assert.equal(later.signatoryTitle,'Director');
 const cleared=await service.updateCompanyProfile({signatoryName:'',signatoryTitle:''});assert.equal(cleared.signatoryName,'');
});
