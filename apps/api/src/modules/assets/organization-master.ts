import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseService } from '../../database/database.service.js';

const text=z.string().trim().max(1000).default('');
export const organizationInput=z.object({
 name:z.string().trim().min(1).max(200),
 code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/,'Organization code must use 1–64 letters, digits, underscores or hyphens').optional(),
 legalName:text,taxId:z.string().trim().regex(/^(?:[0-9]{13})?$/,'Tax ID must contain 13 digits').default(''),
 taxBranch:z.string().trim().max(20).default(''),taxAddress:text,contactName:text,phone:z.string().trim().max(100).default(''),
 documentEmail:z.union([z.email(),z.literal('')]).default(''),
});
export type OrganizationInput=z.input<typeof organizationInput>;
export const organizationColumns='id, name, code, region, status, legal_name AS "legalName", tax_id AS "taxId", tax_branch AS "taxBranch", tax_address AS "taxAddress", contact_name AS "contactName", phone, document_email AS "documentEmail", updated_at::text AS "updatedAt"';
export function parseOrganization(value:unknown) {
 const normalized=value&&typeof value==='object'&&'code' in value&&typeof value.code==='string'&&!value.code.trim()?{...value,code:undefined}:value;
 const result=organizationInput.safeParse(normalized);
 if(!result.success)throw new BadRequestException(result.error.issues.map(i=>i.message).join(', '));
 return {...result.data,generatedCode:result.data.code===undefined,code:result.data.code??'ORG-'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase()};
}
export function organizationCodeError(error:unknown):never {
 const e=error as {code?:string;constraint?:string};
 if(e.code==='23505'&&/customers.*code|organization.*code/.test(e.constraint??''))throw new ConflictException('Organization code already exists; choose another code or select the existing organization');
 throw error;
}
export async function insertOrganization(client:Pick<DatabaseService,'query'>,input:ReturnType<typeof parseOrganization>,region='ภาคกลาง'){
 for(let attempt=0;attempt<5;attempt++) {
 const code=attempt===0?input.code:'ORG-'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
 const result=await client.query(`INSERT INTO customers (id,name,code,region,status,legal_name,tax_id,tax_branch,tax_address,contact_name,phone,document_email)
 VALUES($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11) ${input.generatedCode?'ON CONFLICT (lower(btrim(code))) DO NOTHING':''} RETURNING ${organizationColumns}`,
 [randomUUID(),input.name,code,region,input.legalName,input.taxId,input.taxBranch,input.taxAddress,input.contactName,input.phone,input.documentEmail]);
 const record=result.rows[0];
 if(record)return record;
 if(!input.generatedCode)throw new Error("Organization insert returned no record");
 }
 throw new ConflictException("Unable to allocate organization code; retry creation");
}
/** Runs on the site transaction so failed device/site creation cannot leave a customer behind. */
export async function resolveSiteOrganization(client:Pick<DatabaseService,'query'>,body:{customerId?:string|undefined;customerName?:string|undefined;newOrganization?:OrganizationInput},currentSite?:{id:string;customerId:string}){
 const validateExisting=async(existing:{id:string;status?:string})=>{
  if(currentSite?.customerId===existing.id)return existing.id;
  if(existing.status!=='active')throw new BadRequestException('Choose an active organization');
  // Preserve edits to historical multi-site customers; only a new attachment is restricted.
  if(currentSite?.customerId!==existing.id){
   const attached=await client.query('SELECT id FROM sites WHERE customer_id = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1',[existing.id,currentSite?.id??null]);
   if(attached.rows.length)throw new ConflictException('Organization already has a site; create a new customer for this site');
  }
  return existing.id;
 };
 if(body.customerId){
  if(body.newOrganization)throw new BadRequestException('Choose an existing organization or create a new one');
  const existing=await client.query<{id:string;status:string}>('SELECT id,status FROM customers WHERE id = $1 FOR UPDATE',[body.customerId]);
  if(!existing.rows[0])throw new BadRequestException('Organization not found');
  return validateExisting(existing.rows[0]);
 }
 const input=parseOrganization(body.newOrganization??{name:body.customerName});
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['organization:'+input.name.toLocaleLowerCase()]);
 const existing=await client.query<{id:string;status:string}>('SELECT id,status FROM customers WHERE lower(btrim(name)) = lower($1) ORDER BY id FOR UPDATE',[input.name]);
 if(existing.rows.length>1||existing.rows.length&&body.newOrganization)throw new ConflictException('Organization name already exists; select the correct existing organization');
 if(existing.rows[0])return validateExisting(existing.rows[0]);
 return (await insertOrganization(client,input)).id as string;
}
