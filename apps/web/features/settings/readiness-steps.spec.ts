import assert from 'node:assert/strict';
import test from 'node:test';
import type {FinancialReadinessStatus} from '@solar/api-contracts';
import {groupMissingReadiness} from './readiness-steps';

const status=(items:FinancialReadinessStatus['items']):FinancialReadinessStatus=>({scope:null,fingerprint:'fingerprint',approval:null,items,actions:{calculate:{enabled:false,missing:[]},issue:{enabled:false,missing:[]},approve_payment:{enabled:false,missing:[]},adjust:{enabled:false,missing:[]},send:{enabled:false,missing:[]}}});

test('groups only missing requirements in ordered company, confirmation and environment destinations',async()=>{
  const steps=groupMissingReadiness(status([
    {id:'environment.smtp',ready:false,responsibility:'environment',destination:'/secret-smtp'},
    {id:'approval.confirmation',ready:false,responsibility:'owner',destination:'/settings/company'},
    {id:'company.logo',ready:true,responsibility:'owner',destination:'/settings/company'},
    {id:'company.name',ready:false,responsibility:'owner',destination:'/settings/company'},
    {id:'company.default_bank',ready:false,responsibility:'owner',destination:'/settings/company'},
  ]),'th');
  assert.deepEqual(steps.map(step=>step.key),['company','owner-confirmation','environment']);
  assert.deepEqual(steps.map(step=>step.items.map(item=>item.id)),[['company.name','company.default_bank'],['approval.confirmation'],['environment.smtp']]);
  assert.equal(steps[0]?.destination,'/settings/company');
  assert.equal(steps[2]?.destination,null);
  assert.match(steps[0]!.title,/บริษัท/);
});

test('site steps consolidate into a single readiness step with readable labels without exposing identifiers',async()=>{
  const steps=groupMissingReadiness(status([
    {id:'site.tax',siteId:'site-b',ready:false,responsibility:'owner',destination:'/sites/site-b/settings'},
    {id:'site.binding',siteId:'site-a',ready:false,responsibility:'technical',destination:'/sites/site-a/settings'},
    {id:'unknown.requirement',ready:false,responsibility:'environment'},
    {id:'site.rate',siteId:'site-a',ready:false,responsibility:'owner',destination:'/sites/site-a/settings'},
  ]),'en');
  assert.deepEqual(steps.map(step=>step.key),['sites','environment']);
  assert.equal(steps[0]?.key,'sites');
  assert.equal(steps[0]?.totalSites,2);
  assert.equal(steps[0]?.pendingSitesCount,2);
  assert.deepEqual(steps[0]?.items.map(item=>item.id),['site.tax','site.binding','site.rate']);
  assert.equal(steps[0]?.items[0]?.destination,'/records/sites/site-b');
  assert.equal(steps[0]?.items[2]?.destination,'/records/sites/site-a');
  assert.doesNotMatch(steps.map(step=>[step.title,step.description,...step.items.map(item=>item.label)].join(' ')).join(' '),/site-a|site-b|site\.tax|unknown\.requirement/);
});

test('completed readiness has no missing cards in either locale',async()=>{
  for(const locale of ['th','en'] as const)assert.deepEqual(groupMissingReadiness(status([{id:'company.name',ready:true,responsibility:'owner'}]),locale),[]);
});
