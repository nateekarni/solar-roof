import test from 'node:test';
import assert from 'node:assert/strict';
import {energySampleSpec} from './canonical-energy.mjs';
const profile=(targetUnit,conversion)=>({fields:[{tag:'solar.total_yield',sourceUnit:'Wh',targetUnit,conversion}]});
test('canonical kWh conversion preserves measured generation difference',()=>{const spec=energySampleSpec(profile('kWh','wh-to-kwh'),'solar.total_yield');assert.equal(spec.unit,'kWh');assert.equal((12400-10000)*spec.valueMultiplier,2400);});
test('canonical Wh conversion scales value with unit',()=>{const spec=energySampleSpec(profile('Wh','identity'),'solar.total_yield');assert.equal(spec.unit,'Wh');assert.equal((12400-10000)*spec.valueMultiplier,2400000);});
test('unsupported or mismatched canonical energy mapping is refused',()=>{assert.throws(()=>energySampleSpec(profile('Wh','wh-to-kwh'),'solar.total_yield'));assert.throws(()=>energySampleSpec(profile('MWh','identity'),'solar.total_yield'));assert.throws(()=>energySampleSpec(profile('kWh','wh-to-kwh'),'missing'));});
