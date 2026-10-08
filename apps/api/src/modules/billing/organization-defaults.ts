import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../../database/database.service.js';
export interface OrganizationDefaults {
 id:string; name:string; code:string; schoolId:string;
 legalName:string;taxId:string;taxBranch:string;taxAddress:string;documentEmail:string;phone:string;
}
export async function readOrganizationDefaults(client:Pick<DatabaseService,'query'>,siteId:string):Promise<OrganizationDefaults>{
 const result=await client.query<OrganizationDefaults>(`SELECT sc.id,sc.name,sc.code,s.school_id AS "schoolId",
  sc.legal_name AS "legalName",sc.tax_id AS "taxId",sc.tax_branch AS "taxBranch",sc.tax_address AS "taxAddress",sc.document_email AS "documentEmail",sc.phone
  FROM sites s JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1`,[siteId]);
 if(!result.rows[0])throw new NotFoundException('Site organization not found');
 return result.rows[0];
}
export function contractIdentity(input:{companyName?:string|null;taxId?:string|null;branch?:string|null;taxAddress?:string|null;billingEmail?:string|null;billingPhone?:string|null},defaults:OrganizationDefaults){
 // Undefined means use the master; explicit blank remains blank and cannot bypass validation.
 const value=(override:string|null|undefined,fallback:string)=>(override===undefined?fallback:override??'').trim();
 const identity={
 companyName:value(input.companyName,defaults.legalName),taxId:value(input.taxId,defaults.taxId),branch:value(input.branch,defaults.taxBranch),
 taxAddress:value(input.taxAddress,defaults.taxAddress),billingEmail:value(input.billingEmail,defaults.documentEmail),billingPhone:value(input.billingPhone,defaults.phone),
 };
 const fields:Record<string,{th:string;en:string}>={};
 if(!identity.companyName)fields.companyName={th:'กรุณาระบุชื่อนิติบุคคลลูกค้า',en:'Customer legal name required'};
 if(!/^[0-9]{13}$/.test(identity.taxId))fields.taxId={th:'กรุณาระบุเลขผู้เสียภาษีลูกค้า 13 หลัก',en:'Customer 13-digit tax ID required'};
 if(!identity.taxAddress)fields.taxAddress={th:'กรุณาระบุที่อยู่ลูกค้า',en:'Customer billing address required'};
 if(Object.keys(fields).length)throw new BadRequestException({message:'ข้อมูลภาษีลูกค้าไม่ครบถ้วน / Complete customer tax identity required',fields});
 return identity;
}

