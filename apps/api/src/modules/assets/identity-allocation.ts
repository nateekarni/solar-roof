import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export type IdentityDraftInput = {
 externalSiteId?: string | undefined;
 externalGatewayId?: string | undefined;
 externalDeviceId?: string | undefined;
 gatewayName?: string | undefined;
 additionalDevices?: {externalDeviceId?: string | undefined}[] | undefined;
};
export function operationalCode(value: unknown, prefix: 'SITE' | 'GW' | 'DEV') {
 if(value !== undefined && typeof value !== 'string')throw new BadRequestException('External code must be a string');
 const code=typeof value==='string'?value.trim():'';
 if(code&&!/^[A-Za-z0-9_-]{1,128}$/.test(code))throw new BadRequestException('External codes must contain 1–128 letters, digits, underscores or hyphens');
 return code || `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
}
/** Draft values are returned to the caller and then submitted unchanged on save. No reservation or legacy writes. */
export function identityDraft(body: IdentityDraftInput) {
 if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('Identity draft is required');
 if(body.additionalDevices!==undefined&&(!Array.isArray(body.additionalDevices)||body.additionalDevices.length>31))throw new BadRequestException('At most 31 additional devices');
 const externalSiteId=operationalCode(body.externalSiteId,'SITE'),externalGatewayId=operationalCode(body.externalGatewayId,'GW'),externalDeviceId=operationalCode(body.externalDeviceId,'DEV');
 const used=new Set([externalDeviceId]);
 const additionalDevices=(body.additionalDevices??[]).map(device=>{
  if(!device||typeof device!=='object'||Array.isArray(device))throw new BadRequestException('Invalid additional device');
  let code=operationalCode(device.externalDeviceId,'DEV');
  if(device.externalDeviceId?.trim()&&used.has(code))throw new BadRequestException('Device codes must be unique within the gateway');
  for(let attempt=0;used.has(code)&&attempt<5;attempt++)code=operationalCode(undefined,'DEV');
  if(used.has(code))throw new ConflictException('Unable to allocate device code; retry creation');
  used.add(code);return {externalDeviceId:code};
 });
 return {externalSiteId,externalGatewayId,externalDeviceId,additionalDevices};
}
export function identityConflict(error:unknown):never {
 const e=error as {code?:string;constraint?:string};
 if(e.code==='23505'&&/external_site_id/.test(e.constraint??''))throw new ConflictException('Site code already exists; choose another code and preview again');
 if(e.code==='23505'&&e.constraint==='gateways_external_pair')throw new ConflictException('Gateway code already exists within this site; choose another code');
 if(e.code==='23505'&&e.constraint==='gateways_name_unique_idx')throw new ConflictException('Gateway name already exists; choose another name');
 if(e.code==='23505'&&e.constraint==='devices_external_pair')throw new ConflictException('Device code already exists within this gateway; choose another code and preview again');
 throw error;
}
export function retryGeneratedIdentity(error:unknown,body:IdentityDraftInput,attempt:number) {
 const e=error as {code?:string;constraint?:string};
 if(attempt>=4||e.code!=='23505')return false;
 return (/external_site_id/.test(e.constraint??'')&&!body.externalSiteId?.trim()) ||
  (e.constraint==='gateways_external_pair'&&!body.externalGatewayId?.trim()) ||
  (e.constraint==='gateways_name_unique_idx'&&!body.gatewayName?.trim()) ||
  (e.constraint==='devices_external_pair'&&(!body.externalDeviceId?.trim()||body.additionalDevices?.some(d=>!d.externalDeviceId?.trim())));
}
