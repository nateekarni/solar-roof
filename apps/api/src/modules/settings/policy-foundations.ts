import {createHash} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';

export interface AlarmRuleDefinition {code:string;metric:string;operator:'gt'|'gte'|'lt'|'lte'|'eq';threshold:number;unit:string;severity:'critical'}
export interface HuaweiAlarmSeed {provider:'huawei';provenance:{source:string;reference?:string};rules:AlarmRuleDefinition[];contentHash:string}
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));
export function normalizeHuaweiAlarmSeed(input:unknown):HuaweiAlarmSeed{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new BadRequestException('Huawei alarm seed object required');
 const body=input as Record<string,unknown>,provenance=body.provenance as Record<string,unknown>|undefined;
 if(body.provider!=='huawei'||!exactKeys(body,['provider','provenance','rules'])||!provenance||!exactKeys(provenance,['source','reference'])||typeof provenance.source!=='string'||!provenance.source.trim())throw new BadRequestException('Huawei provenance is required');
 if(!Array.isArray(body.rules)||!body.rules.length)throw new BadRequestException('Explicit Huawei rules are required');
 const rules=body.rules.map((entry,index)=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new BadRequestException(`Invalid Huawei rule ${index}`);
  const rule=entry as Record<string,unknown>;
  if(!exactKeys(rule,['code','metric','operator','threshold','unit','severity'])||typeof rule.code!=='string'||!rule.code.trim()||typeof rule.metric!=='string'||!rule.metric.trim()||!['gt','gte','lt','lte','eq'].includes(String(rule.operator))||typeof rule.threshold!=='number'||!Number.isFinite(rule.threshold)||typeof rule.unit!=='string'||!rule.unit.trim()||rule.severity!=='critical')throw new BadRequestException(`Huawei rule ${index} requires an explicit threshold and supported structure`);
  return {code:rule.code.trim(),metric:rule.metric.trim(),operator:rule.operator as AlarmRuleDefinition['operator'],threshold:rule.threshold,unit:rule.unit.trim(),severity:'critical' as const};
 }).sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
 if(new Set(rules.map(rule=>rule.code)).size!==rules.length)throw new BadRequestException('Huawei rule codes must be unique');
 const normalized={provider:'huawei' as const,provenance:{source:provenance.source.trim(),...(typeof provenance.reference==='string'&&provenance.reference.trim()?{reference:provenance.reference.trim()}: {})},rules};
 const contentHash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
 return {...normalized,contentHash};
}

export interface DisabledLateFeePolicy {enabled:false;reason:string}
export function validateLateFeePolicy(input:unknown):DisabledLateFeePolicy{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new BadRequestException('Late-fee policy object required');
 const value=input as Record<string,unknown>;
 if(value.enabled!==false)throw new BadRequestException('No approved calculation model is configured; late fees must remain disabled');
 if(!exactKeys(value,['enabled','reason'])||typeof value.reason!=='string'||!value.reason.trim())throw new BadRequestException('Disabled late-fee reason required');
 return {enabled:false,reason:value.reason.trim()};
}
export function calculateLateFee(amount:string,policy:DisabledLateFeePolicy){
 if(!/^\d+(\.\d{1,2})?$/.test(amount))throw new BadRequestException('Valid principal amount required');
 return {status:'disabled' as const,amount:'0.00',reason:policy.reason};
}
