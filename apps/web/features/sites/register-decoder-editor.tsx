'use client';

import * as React from 'react';
import {
  GATEWAY_REGISTER_BYTE_ORDERS,
  GATEWAY_REGISTER_DATA_TYPES,
  GATEWAY_REGISTER_WORD_ORDERS,
  gatewayRegisterMappingIssue,
  type GatewayRegisterMapping,
} from '@solar/api-contracts';
import {Field,FieldError,FieldLabel} from '../../components/ui/field';
import {Input} from '../../components/ui/input';
import {Select,SelectContent,SelectGroup,SelectItem,SelectTrigger,SelectValue} from '../../components/ui/select';

export interface RegisterDecoderDraft {
  registerAddress:string;
  registerCount:string;
  dataType:string;
  byteOrder:string;
  wordOrder:string;
  scale:string;
  offset:string;
  unit:string;
  pollingIntervalSeconds:string;
}

export interface RegisterDecoderConstraints {
  dataTypes:readonly string[];
  byteOrders:readonly string[];
  wordOrders:readonly string[];
  registerCountMax:number;
  pollingIntervalMax?:number;
}

export const ONBOARDING_REGISTER_DECODER_CONSTRAINTS:RegisterDecoderConstraints={
  dataTypes:GATEWAY_REGISTER_DATA_TYPES,byteOrders:GATEWAY_REGISTER_BYTE_ORDERS,wordOrders:GATEWAY_REGISTER_WORD_ORDERS,registerCountMax:2_147_483_647,
};
export const REGISTERED_REGISTER_DECODER_CONSTRAINTS:RegisterDecoderConstraints={
  dataTypes:GATEWAY_REGISTER_DATA_TYPES,byteOrders:GATEWAY_REGISTER_BYTE_ORDERS,wordOrders:['little_word_first','big_word_first'],registerCountMax:4,pollingIntervalMax:86_400,
};

export function createRegisterDecoderDraft(value:{registerAddress?:unknown;registerCount?:unknown;dataType?:unknown;byteOrder?:unknown;wordOrder?:unknown;scale?:unknown;offset?:unknown;unit?:unknown;pollingIntervalSeconds?:unknown}):RegisterDecoderDraft {
  const text=(input:unknown)=>input===undefined||input===null?'':String(input);
  return {registerAddress:text(value.registerAddress),registerCount:text(value.registerCount),dataType:text(value.dataType),byteOrder:text(value.byteOrder),wordOrder:text(value.wordOrder),scale:text(value.scale),offset:text(value.offset),unit:text(value.unit),pollingIntervalSeconds:text(value.pollingIntervalSeconds)};
}

function finite(value:string,required:boolean):number|undefined {
  if(value.trim()==='')return required?Number.NaN:undefined;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:Number.NaN;
}

export type RegisterDecoderCommitValue={
  registerAddress:string;registerCount:number;dataType:NonNullable<GatewayRegisterMapping['dataType']>;
  byteOrder:NonNullable<GatewayRegisterMapping['byteOrder']>;wordOrder:NonNullable<GatewayRegisterMapping['wordOrder']>;
  scale:number;offset?:number;unit:string;pollingIntervalSeconds?:number;
};
export function commitRegisterDecoderDraft(draft:RegisterDecoderDraft,constraints:RegisterDecoderConstraints=ONBOARDING_REGISTER_DECODER_CONSTRAINTS):
  {ok:true;value:RegisterDecoderCommitValue}|{ok:false;issue:string} {
  const registerCount=finite(draft.registerCount,true),scale=finite(draft.scale,true),offset=finite(draft.offset,false),polling=finite(draft.pollingIntervalSeconds,false);
  const mapping={registerAddress:draft.registerAddress.trim(),registerCount,dataType:draft.dataType,byteOrder:draft.byteOrder,wordOrder:draft.wordOrder,scale,...(offset===undefined?{}:{offset})} as GatewayRegisterMapping;
  if(!mapping.registerAddress)return {ok:false,issue:'Register address is required.'};
  if(gatewayRegisterMappingIssue(mapping))return {ok:false,issue:'Register decoder is incomplete or invalid.'};
  if(!constraints.dataTypes.includes(draft.dataType)||!constraints.byteOrders.includes(draft.byteOrder)||!constraints.wordOrders.includes(draft.wordOrder)||
    (registerCount??0)>constraints.registerCountMax)return {ok:false,issue:'Register decoder is not supported by this endpoint.'};
  if(polling!==undefined&&(!Number.isInteger(polling)||polling<1))return {ok:false,issue:'Read cadence must be a positive whole number.'};
  if(polling!==undefined&&constraints.pollingIntervalMax!==undefined&&polling>constraints.pollingIntervalMax)return {ok:false,issue:'Read cadence exceeds the supported maximum.'};
  return {ok:true,value:{registerAddress:mapping.registerAddress!,registerCount:mapping.registerCount!,dataType:mapping.dataType!,byteOrder:mapping.byteOrder!,wordOrder:mapping.wordOrder!,scale:mapping.scale!,...(mapping.offset===undefined?{}:{offset:mapping.offset}),unit:draft.unit,...(polling===undefined?{}:{pollingIntervalSeconds:polling})}};
}

type RegisterDecoderPatch=Omit<RegisterDecoderCommitValue,'unit'>;
export function applyRegisterDecoderCommit<T extends object>(current:T,value:RegisterDecoderPatch):T&RegisterDecoderPatch {
  const next={...current,...value} as T&RegisterDecoderPatch;
  for(const key of ['offset','pollingIntervalSeconds'] as const)if(value[key]===undefined)delete (next as Record<string,unknown>)[key];
  return next;
}

function DecoderSelect({id,label,value,options,onChange}:{id:string;label:string;value:string;options:readonly string[];onChange:(value:string)=>void}){
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue placeholder="—"/></SelectTrigger><SelectContent><SelectGroup>{options.map(option=><SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

export function RegisterDecoderFields({idPrefix,draft,onChange,onCommit,locale,showOffset=true,showUnit=false,showPolling=false,error,constraints=ONBOARDING_REGISTER_DECODER_CONSTRAINTS}:{
  idPrefix:string;draft:RegisterDecoderDraft;onChange:(draft:RegisterDecoderDraft)=>void;onCommit?:(draft:RegisterDecoderDraft)=>void;locale:string;showOffset?:boolean;showUnit?:boolean;showPolling?:boolean;error?:string;constraints?:RegisterDecoderConstraints;
}){
  const th=locale==='th';
  const patched=(key:keyof RegisterDecoderDraft,value:string)=>({...draft,[key]:value});
  const patch=(key:keyof RegisterDecoderDraft,value:string)=>onChange(patched(key,value));
  const numeric=(key:'registerCount'|'scale'|'offset'|'pollingIntervalSeconds',label:string,integer=false)=><Field><FieldLabel htmlFor={`${idPrefix}-${key}`}>{label}</FieldLabel><Input id={`${idPrefix}-${key}`} type="text" inputMode="decimal" value={draft[key]} onChange={event=>patch(key,event.target.value)} onBlur={()=>onCommit?.(draft)} aria-invalid={Boolean(error)||undefined} {...(integer?{pattern:'[0-9]*'}:{})}/></Field>;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <Field><FieldLabel htmlFor={`${idPrefix}-address`}>{th?'ที่อยู่รีจิสเตอร์':'Register address'}</FieldLabel><Input id={`${idPrefix}-address`} value={draft.registerAddress} onChange={event=>patch('registerAddress',event.target.value)} onBlur={()=>onCommit?.(draft)} aria-invalid={Boolean(error)||undefined}/></Field>
    {numeric('registerCount',th?'จำนวนรีจิสเตอร์':'Register count',true)}
    <DecoderSelect id={`${idPrefix}-type`} label={th?'ชนิดข้อมูล':'Data type'} value={draft.dataType} options={constraints.dataTypes} onChange={value=>{const next=patched('dataType',value);onChange(next);onCommit?.(next);}}/>
    <DecoderSelect id={`${idPrefix}-byte`} label={th?'ลำดับไบต์':'Byte order'} value={draft.byteOrder} options={constraints.byteOrders} onChange={value=>{const next=patched('byteOrder',value);onChange(next);onCommit?.(next);}}/>
    <DecoderSelect id={`${idPrefix}-word`} label={th?'ลำดับเวิร์ด':'Word order'} value={draft.wordOrder} options={constraints.wordOrders} onChange={value=>{const next=patched('wordOrder',value);onChange(next);onCommit?.(next);}}/>
    {numeric('scale',th?'ตัวคูณ':'Scale')}
    {showOffset&&numeric('offset',th?'ค่าออฟเซ็ต':'Offset')}
    {showUnit&&<Field><FieldLabel htmlFor={`${idPrefix}-unit`}>{th?'หน่วยต้นทาง':'Source unit'}</FieldLabel><Input id={`${idPrefix}-unit`} value={draft.unit} onChange={event=>patch('unit',event.target.value)} onBlur={()=>onCommit?.(draft)}/></Field>}
    {showPolling&&numeric('pollingIntervalSeconds',th?'รอบอ่าน (วินาที)':'Read cadence (seconds)',true)}
    {error&&<FieldError className="sm:col-span-2 lg:col-span-3">{error}</FieldError>}
  </div>;
}
