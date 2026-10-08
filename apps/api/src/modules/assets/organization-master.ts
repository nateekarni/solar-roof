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
 const result=organizationInput.safeParse(value);
 if(!result.success)throw new BadRequestException(result.error.issues.map(i=>i.message).join(', '));
 return {...result.data,code:result.data.code??'ORG-'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase()};
}
export function organizationCodeError(error:unknown):never {
 const e=error as {code?:string;constraint?:string};
 if(e.code==='23505'&&/schools.*code|organization.*code/.test(e.constraint??''))throw new ConflictException('Organization code already exists; choose another code or select the existing organization');
 throw error;
}
export async function insertOrganization(client:Pick<DatabaseService,'query'>,input:ReturnType<typeof parseOrganization>,region='ภาคกลาง'){
 const result=await client.query(`INSERT INTO schools (id,name,code,region,status,legal_name,tax_id,tax_branch,tax_address,contact_name,phone,document_email)
 VALUES($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,$11) RETURNING ${organizationColumns}`,
 [randomUUID(),input.name,input.code,region,input.legalName,input.taxId,input.taxBranch,input.taxAddress,input.contactName,input.phone,input.documentEmail]);
 const record=result.rows[0];
 if(!record)throw new Error("Organization insert returned no record");
 return record;
}
/** Runs on the site transaction so failed device/site creation cannot leave a customer behind. */
export async function resolveSiteOrganization(client:Pick<DatabaseService,'query'>,body:{schoolId?:string|undefined;schoolName?:string|undefined;newOrganization?:OrganizationInput}){
 if(body.schoolId){
  if(body.newOrganization)throw new BadRequestException('Choose an existing organization or create a new one');
  const existing=await client.query('SELECT id FROM schools WHERE id = $1 FOR UPDATE',[body.schoolId]);
  if(!existing.rows[0])throw new BadRequestException('Organization not found');
  return body.schoolId;
 }
 const input=parseOrganization(body.newOrganization??{name:body.schoolName});
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['organization:'+input.name.toLocaleLowerCase()]);
 const existing=await client.query('SELECT id FROM schools WHERE lower(btrim(name)) = lower($1) ORDER BY id FOR UPDATE',[input.name]);
 if(existing.rows.length>1||existing.rows.length&&body.newOrganization)throw new ConflictException('Organization name already exists; select the correct existing organization');
 if(existing.rows[0])return existing.rows[0].id as string;
 return (await insertOrganization(client,input)).id as string;
}
