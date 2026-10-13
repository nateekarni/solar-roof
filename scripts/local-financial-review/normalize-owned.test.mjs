import test from 'node:test';
import assert from 'node:assert/strict';
import * as normalization from './guard.mjs';
test('normalization changes only owned fixture displays and preserves passwords and financial fields',()=>{
 assert.equal(typeof normalization.ownedDisplayChanges,'function');
 const rows=[{id:'owned',name:'[TEST] อาคารหลักเอ',amount:100},{id:'other',name:'[TEST] Unrelated'}];
 assert.deepEqual(normalization.ownedDisplayChanges(rows,new Set(['owned']),'name'),[{id:'owned',value:'อาคารหลักเอ'}]);
 assert.deepEqual(normalization.ownedDisplayChanges([{id:'owned',name:'อาคารหลักเอ'}],new Set(['owned']),'name'),[]);
 assert.deepEqual(normalization.ownedDisplayChanges([{id:'owned',display_name:'[TEST กันยายน] customer_user',role:'customer_user',password_hash:'keep'}],new Set(['owned']),'display_name'),[{id:'owned',value:'ผู้ประสานงานลูกค้า Solar Roof'}]);
});
test('gateway cleanup verifies full or accepted short fixture code',()=>{
 assert.equal(typeof normalization.acceptanceGatewayName,'function');
 assert.equal(normalization.acceptanceGatewayName('Document gateway 4fd6c0f7bb0f4bcea9d8b29fee1f2cb3','DOC-4FD6C0F7','อาคารเอกสาร'),'เกตเวย์ อาคารเอกสาร');
 assert.equal(normalization.acceptanceGatewayName('Document gateway 4fd6c0f7bb0f4bcea9d8b29fee1f2cb3','DOC-OTHER','อาคารเอกสาร'),null);
});
test('acceptance display cleanup requires exact fixture label and matching technical code',()=>{
 assert.equal(typeof normalization.acceptanceDisplayName,'function');
 assert.equal(normalization.acceptanceDisplayName('Browser acceptance 1791441293281','UI-1791441293281',1),'โครงการ Solar Roof อาคารแสดงผล 1');
 assert.equal(normalization.acceptanceDisplayName('Document channel acceptance 5f057d159d5c4f06838818bfff04b7d0','DOC-5f057d159d5c4f06838818bfff04b7d0',2),'โครงการ Solar Roof อาคารเอกสาร 2');
 assert.equal(normalization.acceptanceDisplayName('Browser acceptance 1791441293281','OTHER',1),null);
 assert.equal(normalization.acceptanceDisplayName('Real business','UI-1791441293281',1),null);
});
test('clean profile revision leaves the historical config untouched',()=>{
 assert.equal(typeof normalization.cleanProfileConfig,'function');
 const original={id:'sep-meter',version:'1.0.0',displayName:'[TEST] September meter',fields:[{tag:'energy'}]};
 assert.deepEqual(normalization.cleanProfileConfig(original),{...original,version:'1.0.1',displayName:'September meter'});
 assert.equal(original.displayName,'[TEST] September meter');
});
test('fixture assignment is repeatable and never replaces a different active site',()=>{
 assert.equal(typeof normalization.needsFixtureAssignment,'function');
 assert.equal(normalization.needsFixtureAssignment(undefined,'site-a'),true);
 assert.equal(normalization.needsFixtureAssignment({site_id:'site-a'},'site-a'),false);
 assert.throws(()=>normalization.needsFixtureAssignment({site_id:'site-b'},'site-a'));
});
