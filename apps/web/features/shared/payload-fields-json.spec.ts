import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePayloadFieldsJson} from './payload-fields-json';
const field={tag:'energy.total',displayName:'พลังงานสะสม',pollGroup:'energy',sourceUnit:'kWh',targetUnit:'kWh',conversion:'identity',role:'billing-import',sourceTag:'meter.energy',required:true};
test('field JSON round trip preserves mapping and billing metadata',()=>assert.deepEqual(parsePayloadFieldsJson(JSON.stringify([field])),[field]));
test('invalid JSON and complete-profile objects cannot replace the fields draft',()=>{
 for(const input of ['[',JSON.stringify({fields:[field]}),JSON.stringify([{...field,required:'yes'}]),JSON.stringify([{...field,conversion:'bad'}]),JSON.stringify([field,field])])assert.throws(()=>parsePayloadFieldsJson(input));
});
test('empty field collection is editable but single-field editor requires one item',()=>{
 assert.deepEqual(parsePayloadFieldsJson('[]'),[]);assert.throws(()=>parsePayloadFieldsJson('[]',true));assert.throws(()=>parsePayloadFieldsJson(JSON.stringify([field,{...field,tag:'other'}]),true));
});
