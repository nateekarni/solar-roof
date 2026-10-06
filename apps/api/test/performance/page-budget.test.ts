import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPageBudget} from './page-budget';

test('reports the failing route, cache state and phase without hiding a slow sample', () => {
  assert.throws(() => assertPageBudget([
    {user:0,path:'/billing',cache:'browser-warm',phase:'steady',ms:100,error:null},
    {user:4,path:'/',cache:'browser-cold',phase:'steady',ms:2059.6,error:null},
  ]), /user=4 route=\/ cache=browser-cold phase=steady ready=2059\.6ms/);
});
test('accepts the exact boundary, rejects missing or invalid samples', () => {
  assert.doesNotThrow(() => assertPageBudget([{ms:2000}]));
  for (const pages of [[], [{ms:NaN}], [{ms:Infinity}], [{ms:-1}], [{ms:100,error:'failed'}]]) {
    assert.throws(() => assertPageBudget(pages));
  }
});
