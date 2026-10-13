import {ConflictException} from '@nestjs/common';
import type {FinancialScope} from '@solar/api-contracts';
import {financialConfigurationHash} from '../financial-readiness/financial-configuration.js';
import {decimal,TEST_FINANCIAL_POLICY,TEST_FINANCIAL_POLICY_HASH} from './local-financial-policy.js';
import {configuredTotals,exactRate,scaledDecimal} from './site-billing-policy.js';

export function energyCharge(kwh:unknown,rate:unknown){
 const energy=scaledDecimal(kwh,3),price=scaledDecimal(rate,4);
 return {consumedKwh:decimal(energy,3),rate:decimal(price,4),subtotal:decimal((energy*price+50000n)/100000n,2)};
}
export function financialPolicySnapshot(config:{tax_rate:unknown;prices_include_tax:boolean},scope:FinancialScope){
 if(scope==='TEST')return {...TEST_FINANCIAL_POLICY};
 const taxRate=exactRate(config.tax_rate);
 if(scaledDecimal(taxRate,4)>1000000n||typeof config.prices_include_tax!=='boolean')throw new ConflictException('Confirmed financial policy required');
 return {scope:'PRODUCTION' as const,currency:'THB',taxRate,pricesIncludeTax:config.prices_include_tax,kwhScale:3,rateScale:4,moneyScale:2,rounding:'half_up',documentNumbering:'database_sequence'};
}
export function financialPolicyHash(policy:unknown):string{
 return financialConfigurationHash(policy);
}
export function financialTotals(gross:unknown,policy:ReturnType<typeof financialPolicySnapshot>){
 if(policy.scope!=='PRODUCTION')throw new ConflictException('Configured production policy required');
 return configuredTotals(gross,policy.taxRate,policy.pricesIncludeTax);
}
/** Historical TEST cycles retain their original policy hash. New cycles always persist a snapshot. */
export function validateFinancialPolicy(cycle:{policy_snapshot?:any;policy_hash?:string;financial_scope?:string}){
 if(!cycle.policy_snapshot&&cycle.policy_hash===TEST_FINANCIAL_POLICY_HASH&&(!cycle.financial_scope||cycle.financial_scope==='TEST'))return {...TEST_FINANCIAL_POLICY};
 const policy=cycle.policy_snapshot;
 const expected=policy?.scope==='TEST'?TEST_FINANCIAL_POLICY_HASH:financialPolicyHash(policy??null);
 if(!policy||!['TEST','PRODUCTION'].includes(policy.scope)||policy.scope!==cycle.financial_scope||cycle.policy_hash!==expected)throw new ConflictException('Frozen financial policy integrity check failed');
 if(policy.scope==='PRODUCTION'&&financialPolicyHash(financialPolicySnapshot({tax_rate:policy.taxRate,prices_include_tax:policy.pricesIncludeTax},'PRODUCTION'))!==expected)throw new ConflictException('Frozen financial policy configuration invalid');
 if(policy.scope==='TEST'&&JSON.stringify(policy)!==JSON.stringify(TEST_FINANCIAL_POLICY))throw new ConflictException('Frozen TEST financial policy invalid');
 return policy;
}
