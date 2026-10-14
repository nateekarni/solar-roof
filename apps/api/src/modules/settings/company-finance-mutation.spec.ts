import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsService } from './settings.service.js';
import { bank, settingsDatabase, testCompany } from './company-settings.test-fixtures.js';
import {createHash} from 'node:crypto';

test('company and approval revocation audits retain before/after evidence with hashed images',async()=>{
 const image='data:image/png;base64,iVBORw0KGgo=';
 const f=settingsDatabase({...testCompany,logoUrl:image,signatureDataUri:image});
 await new SettingsService(f.db).updateCompanyProfile({companyName:'Updated legal issuer'},'owner-a');
 const mutation=f.state.audits[0]!,revocation=f.state.audits[1]!;
 assert.ok(mutation.before,'Persisted before_json is required');assert.ok(mutation.after,'Persisted after_json is required');
 assert.equal(mutation.before.company.companyName,'Issuer');assert.equal(mutation.after.company.companyName,'Updated legal issuer');
 assert.equal(mutation.before.company.logoUrl.sha256,createHash('sha256').update(image).digest('hex'));
 assert.ok(!JSON.stringify(f.state.audits).includes('base64,'));
 assert.equal(revocation.before.status,'active');assert.equal(revocation.after.status,'revoked');assert.equal(revocation.after.revokedBy,'owner-a');assert.equal(revocation.after.reason,'financial_configuration_changed');
 assert.notEqual(mutation.before.configHash,mutation.after.configHash);
});

test('bank deletion audit preserves the deleted default and the promoted default without raw account numbers',async()=>{
 const f=settingsDatabase({...testCompany},[{...bank('bank-a',true),accountNumber:'0123456789'},bank('bank-b')]);
 await new SettingsService(f.db).deleteBankAccount('bank-a','owner-a');
 const mutation=f.state.audits[0]!;
 assert.ok(mutation.before,'Persisted before_json is required');assert.ok(mutation.after,'Persisted after_json is required');
 assert.deepEqual(mutation.before.banks.map((b:any)=>[b.id,b.isDefault]),[['bank-a',true],['bank-b',false]]);
 assert.deepEqual(mutation.after.banks.map((b:any)=>[b.id,b.isDefault]),[['bank-b',true]]);
 assert.equal(mutation.before.banks[0].accountNumber.sha256,createHash('sha256').update('0123456789').digest('hex'));
 assert.ok(!JSON.stringify(f.state.audits).includes('0123456789'));
});

test('company financial change commits actor audit and approval revocation together',async()=>{
  const f=settingsDatabase();const service=new SettingsService(f.db);
  await service.updateCompanyProfile({taxId:'9876543210987'},'owner-a');
  assert.equal(f.state.company.taxId,'9876543210987');assert.equal(f.state.approval.revokedBy,'owner-a');
  assert.deepEqual(f.state.audits.map(a=>[a.actor,a.action]),[['owner-a','company.profile.updated'],['owner-a','finance.approval.revoked']]);
  assert.ok(f.statements.every(s=>s.transaction));
  assert.ok(f.statements.some(s=>s.sql.includes('FOR UPDATE')));
  assert.ok(f.statements.some(s=>s.sql.includes('pg_advisory_xact_lock')));
});
test('identical save preserves approval despite database timestamps',async()=>{
  const f=settingsDatabase();await new SettingsService(f.db).updateCompanyProfile({...testCompany,updatedAt:'later'},'owner-a');
  assert.equal(f.state.approval.revokedBy,null);assert.equal(f.state.audits[0]?.action,'company.profile.updated');
});
test('audit failure rolls back company change and revocation',async()=>{
  const f=settingsDatabase();f.failAudit();await assert.rejects(()=>new SettingsService(f.db).updateCompanyProfile({taxId:'different'},'owner-a'),/Audit unavailable/);
  assert.equal(f.state.company.taxId,'1234567890123');assert.equal(f.state.approval.revokedBy,null);
});
test('bank creation promotes exactly one default and records actor',async()=>{
  const f=settingsDatabase();const saved=await new SettingsService(f.db).saveBankAccount({bankName:'New',accountName:'Issuer',accountNumber:'2',isDefault:true},'owner-a');
  assert.equal(saved.isDefault,true);assert.deepEqual(f.state.banks.filter(b=>b.isDefault).map(b=>b.id),['bank-new']);
  assert.equal(f.state.audits[0]?.action,'company.bank.created');assert.equal(f.state.audits[0]?.actor,'owner-a');assert.equal(f.state.approval.revokedBy,'owner-a');
  assert.ok(f.statements.every(s=>s.transaction));
});
test('first bank becomes default even when the request opts out',async()=>{
  const f=settingsDatabase({...testCompany},[]);const saved=await new SettingsService(f.db).saveBankAccount({bankName:'Bank',accountName:'Issuer',accountNumber:'1',isDefault:false},'owner-a');
  assert.equal(saved.isDefault,true);assert.equal(f.state.banks.filter(b=>b.isDefault).length,1);
});
test('bank updates can promote another account and cannot leave defaults empty',async()=>{
  const f=settingsDatabase({...testCompany},[bank('bank-a',true),bank('bank-b')]);const s=new SettingsService(f.db);
  await s.saveBankAccount({id:'bank-b',isDefault:true},'owner-a');
  assert.deepEqual(f.state.banks.filter(b=>b.isDefault).map(b=>b.id),['bank-b']);
  await s.saveBankAccount({id:'bank-b',isDefault:false},'owner-a');
  assert.equal(f.state.banks.filter(b=>b.isDefault).length,1);assert.equal(f.state.audits[0]?.action,'company.bank.updated');
});
test('unchanged bank save leaves approval active',async()=>{
  const f=settingsDatabase();await new SettingsService(f.db).saveBankAccount({...bank('bank-a',true),updatedAt:'later'},'owner-a');
  assert.equal(f.state.approval.revokedBy,null);
  assert.equal(f.state.audits[0]?.action,'company.bank.updated');
});
test('deleting default promotes oldest remaining bank and deleting final bank leaves none',async()=>{
  const f=settingsDatabase({...testCompany},[bank('bank-a',true),bank('bank-b'),bank('bank-c')]);const s=new SettingsService(f.db);
  await s.deleteBankAccount('bank-a','owner-a');assert.deepEqual(f.state.banks.filter(b=>b.isDefault).map(b=>b.id),['bank-b']);
  await s.deleteBankAccount('bank-b','owner-a');await s.deleteBankAccount('bank-c','owner-a');assert.deepEqual(f.state.banks,[]);
  assert.equal(f.state.audits[0]?.action,'company.bank.deleted');assert.equal(f.state.approval.revokedBy,'owner-a');assert.ok(f.statements.every(q=>q.transaction));
});
test('new logo writes reject legacy paths while unrelated saves preserve legacy logos',async()=>{
  const f=settingsDatabase({...testCompany,logoUrl:'/brand/solar-roof-mark.png'});const s=new SettingsService(f.db);
  await s.updateCompanyProfile({companyName:'New'},'owner-a');assert.equal(f.state.company.logoUrl,'/brand/solar-roof-mark.png');
  await assert.rejects(()=>s.updateCompanyProfile({logoUrl:'/brand/new.png'},'owner-a'),/Logo must/);
});

test('default deletion promotes the oldest account using PostgreSQL Date timestamps',async()=>{
 const f=settingsDatabase({...testCompany},[bank('default',true),{...bank('bank-a'),createdAt:new Date('2026-10-12T00:00:00Z') as any},{...bank('bank-z'),createdAt:new Date('2026-10-11T00:00:00Z') as any}]);
 await new SettingsService(f.db).deleteBankAccount('default','owner-a');
 assert.deepEqual(f.state.banks.filter(b=>b.isDefault).map(b=>b.id),['bank-z']);
});

test('default deletion skips older unconfigured accounts and promotes the oldest configured account',async()=>{
 const f=settingsDatabase({...testCompany},[
  bank('bank-a',true),
  {...bank('bank-b',false,false),createdAt:new Date('2026-10-10T00:00:00Z') as any},
  {...bank('bank-c'),createdAt:new Date('2026-10-11T00:00:00Z') as any},
  {...bank('bank-d'),createdAt:new Date('2026-10-12T00:00:00Z') as any},
 ]);
 await new SettingsService(f.db).deleteBankAccount('bank-a','owner-a');
 assert.deepEqual(f.state.banks.filter(b=>b.isDefault).map(b=>b.id),['bank-c']);
 assert.equal(f.state.banks.find(b=>b.id==='bank-b')?.isConfigured,false);
});

test('default deletion leaves no default when every remaining account is unconfigured',async()=>{
 const f=settingsDatabase({...testCompany},[bank('bank-a',true),bank('bank-b',true,false)]);
 await new SettingsService(f.db).deleteBankAccount('bank-a','owner-a');
 assert.deepEqual(f.state.banks.filter(b=>b.isDefault),[]);
 assert.equal(f.state.banks.length,1);
});
