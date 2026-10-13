import assert from 'node:assert/strict';
import test from 'node:test';
import {energyCharge,financialPolicySnapshot,financialPolicyHash,validateFinancialPolicy,financialTotals} from './financial-policy.js';

// Catches TEST arithmetic leaking into production or rounding through binary floats.
test('energy charges round exactly at half a satang without applying any tax',()=>{
 assert.deepEqual(energyCharge('1.000','0.0050'),{consumedKwh:'1.000',rate:'0.0050',subtotal:'0.01'});
 assert.deepEqual(energyCharge('1234.567','3.4567'),{consumedKwh:'1234.567',rate:'3.4567',subtotal:'4267.53'});
});
test('production freezes exact configured exclusive and inclusive tax policies',()=>{
 const exclusive=financialPolicySnapshot({tax_rate:'10',prices_include_tax:false},'PRODUCTION');
 assert.deepEqual(exclusive,{scope:'PRODUCTION',currency:'THB',taxRate:'10.0000',pricesIncludeTax:false,kwhScale:3,rateScale:4,moneyScale:2,rounding:'half_up',documentNumbering:'database_sequence'});
 const inclusive=financialPolicySnapshot({tax_rate:'5.5',prices_include_tax:true},'PRODUCTION');
 assert.equal(inclusive.taxRate,'5.5000');assert.equal(inclusive.pricesIncludeTax,true);
 assert.equal('taxPercent' in exclusive,false);assert.equal('logo' in exclusive,false);
});
test('frozen configured production tax computes exclusive and inclusive literal half-up totals',()=>{
 assert.deepEqual(financialTotals('100.05',financialPolicySnapshot({tax_rate:'10',prices_include_tax:false},'PRODUCTION')),{subtotal:'100.05',tax:'10.01',total:'110.06'});
 assert.deepEqual(financialTotals('105.50',financialPolicySnapshot({tax_rate:'5.5',prices_include_tax:true},'PRODUCTION')),{subtotal:'100.00',tax:'5.50',total:'105.50'});
 assert.deepEqual(financialTotals('1.05',financialPolicySnapshot({tax_rate:'100',prices_include_tax:true},'PRODUCTION')),{subtotal:'0.53',tax:'0.52',total:'1.05'});
});
test('policy hashes are canonical and change with confirmed tax and inclusion settings',()=>{
 const p=financialPolicySnapshot({tax_rate:'10',prices_include_tax:false},'PRODUCTION');
 assert.equal(financialPolicyHash(p),financialPolicyHash(Object.fromEntries(Object.entries(p).reverse())));
 assert.notEqual(financialPolicyHash(p),financialPolicyHash(financialPolicySnapshot({tax_rate:'5',prices_include_tax:false},'PRODUCTION')));
 assert.notEqual(financialPolicyHash(p),financialPolicyHash({...p,pricesIncludeTax:true}));
 assert.equal(validateFinancialPolicy({policy_snapshot:p,policy_hash:financialPolicyHash(p),financial_scope:'PRODUCTION'}).scope,'PRODUCTION');
 assert.throws(()=>validateFinancialPolicy({policy_snapshot:{...p,taxRate:'7.0000'},policy_hash:financialPolicyHash(p),financial_scope:'PRODUCTION'}),/policy/);
 assert.throws(()=>validateFinancialPolicy({policy_snapshot:p,policy_hash:financialPolicyHash(p),financial_scope:'TEST'}),/policy/);
});
