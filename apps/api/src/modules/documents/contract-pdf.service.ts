import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { schoolScope, type ScopePrincipal } from '../../common/auth/route-policy.js';
import type { FrozenRecipient } from '../billing/saved-document-delivery.js';
import { BRAND_PRIMARY } from '@solar/domain';
import { localFinancialBinding } from '../billing/local-financial-policy.js';
import { capacityKwp, freezeLocalPpaDraft } from './local-ppa-draft.js';
import { allocateDocumentNumber } from './document-number.js';
import { renderDocumentPdf, type DocumentSnapshot } from './document-layout.js';

export type ScopedActor = ScopePrincipal;
export const CONTRACT_TEMPLATE_VERSION = 'ppa-th-sarabun-new-v4';
interface ContractSource {
 capacity_mwp?:string|null; id:string; site_id:string; site_name:string; external_site_id?:string|null; school_id:string; version?:number;
 start_date:string; end_date:string|null; issue_date?:string; document_number?:string;
 company_name:string; tax_id:string; tax_address:string; branch?:string; billing_phone?:string; billing_email?:string;
 payment_terms:string; payment_term_days?:number|null; recipient_user_ids?:string[];
 signer_name:string; signer_title?:string|null; customer_signer_name?:string|null; customer_signer_title?:string|null;
}
interface IssuerSource {company_name:string;tax_id:string;address:string;branch?:string;phone?:string;email?:string;}
export interface ContractSnapshot extends DocumentSnapshot {
 deliveryRecipients:FrozenRecipient[];
 contractId:string;siteId:string;schoolId:string;contractVersion?:number|undefined;startDate:string;endDate?:string|undefined;paymentTermDays?:number|null|undefined;
}
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
export function buildContractSnapshot(contract:ContractSource,issuer:IssuerSource|undefined,rates:DocumentSnapshot['rates'],logoDataUri:string):ContractSnapshot {
 const fields:Record<string,{th:string;en:string}>={};
 const required=(key:string,value:unknown,th:string,en:string,tax=false)=>{if(tax?!/^\d{13}$/.test(text(value)):!text(value))fields[key]={th,en};};
 required('issuer.companyName',issuer?.company_name,'กรุณาระบุชื่อนิติบุคคลผู้ขาย','Issuer legal name required');
 required('issuer.taxId',issuer?.tax_id,'กรุณาระบุเลขผู้เสียภาษีผู้ขาย 13 หลัก','Issuer 13-digit tax ID required',true);
 required('issuer.address',issuer?.address,'กรุณาระบุที่อยู่ผู้ขาย','Issuer address required');
 required('companyName',contract.company_name,'กรุณาระบุชื่อนิติบุคคลลูกค้า','Customer legal name required');
 required('taxId',contract.tax_id,'กรุณาระบุเลขผู้เสียภาษีลูกค้า 13 หลัก','Customer 13-digit tax ID required',true);
 required('taxAddress',contract.tax_address,'กรุณาระบุที่อยู่ลูกค้า','Customer billing address required');
 required('signerName',contract.signer_name,'กรุณาระบุชื่อผู้ลงนามฝ่ายผู้ให้บริการ','Provider signatory name required');
 required('documentNumber',contract.document_number,'กรุณาระบุเลขที่สัญญาที่ออกแล้ว','Issued contract number required');
 required('paymentTerms',contract.payment_terms,'กรุณาระบุเงื่อนไขการชำระเงิน','Payment terms required');
 if(!rates.length||rates.some(r=>!/^\d+(\.\d+)?$/.test(r.rate)))fields.rates={th:'กรุณาระบุอัตราค่าไฟที่บันทึกไว้',en:'Recorded nonnegative rate schedule required'};
 if(Object.keys(fields).length)throw new BadRequestException({message:'ข้อมูลสัญญาไม่ครบถ้วน / Complete contract identity and rate schedule required',fields});
 const snapshot:ContractSnapshot = {
  brandPrimary:BRAND_PRIMARY,...(capacityKwp(contract.capacity_mwp)===undefined?{}:{capacityKwp:capacityKwp(contract.capacity_mwp)!}),
  deliveryRecipients:[],
  type:'contract',documentNumber:contract.document_number!,contractNumber:contract.document_number!,contractId:contract.id,
  siteId:contract.site_id,schoolId:contract.school_id,siteName:contract.site_name,siteExternalId:contract.external_site_id??undefined,contractVersion:contract.version,
  startDate:contract.start_date,endDate:contract.end_date??undefined,issueDate:contract.issue_date??contract.start_date,
  issuer:{name:text(issuer!.company_name),taxId:text(issuer!.tax_id),address:text(issuer!.address),branch:text(issuer!.branch),phone:text(issuer!.phone),email:text(issuer!.email)},
  customer:{name:text(contract.company_name),taxId:text(contract.tax_id),address:text(contract.tax_address),branch:text(contract.branch),phone:text(contract.billing_phone),email:text(contract.billing_email)},
  signatories:{issuer:{name:text(contract.signer_name),title:text(contract.signer_title)},customer:{name:text(contract.customer_signer_name),title:text(contract.customer_signer_title)}},
  paymentTerms:contract.payment_terms,paymentTermDays:contract.payment_term_days,rates:rates.map(r=>({...r})),
  items:[],approvedTransfers:[],paymentAccounts:[],logoDataUri,templateVersion:CONTRACT_TEMPLATE_VERSION,syntheticTest:false,
 };
 if(localFinancialBinding()){snapshot.syntheticTest=true;Object.assign(snapshot,freezeLocalPpaDraft(snapshot));}
 return snapshot;
}
/** Optional mail identity never blocks original PDF issuance. An incomplete selection disables sending. */
export async function contractDeliveryRecipients(client:Pick<PoolClient,'query'>,contract:ContractSource):Promise<FrozenRecipient[]> {
 const ids=[...new Set(contract.recipient_user_ids??[])];const email=text(contract.billing_email);
 if(!ids.length&&!email)return [];
 const recipients=(await client.query<FrozenRecipient>(`SELECT u.id,u.email,u.display_name AS name FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND ${ids.length?'u.id=ANY($2::uuid[])':'u.email=$2'} AND u.role='school_user' AND u.status='active' AND sc.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.id`,[contract.site_id,ids.length?ids:email])).rows;
 if(ids.length&&recipients.length!==ids.length)return [];
 return recipients.map(r=>({...r}));
}
async function approvedLogo():Promise<string>{
 const logo=await readFile(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url));
 return `data:image/png;base64,${logo.toString('base64')}`;
}
@Injectable()
export class ContractPdfService {
 constructor(@Inject(DatabaseService) private readonly db:DatabaseService,
  @Optional() @Inject('CONTRACT_PDF_RENDERER') private readonly render:(snapshot:DocumentSnapshot)=>Promise<Buffer>=renderDocumentPdf,
  @Optional() @Inject('CONTRACT_DOCUMENT_LOGO') private readonly logo:()=>Promise<string>=approvedLogo){}
 async ensureContractOriginal(contractId:string,actor:ScopedActor):Promise<{documentId:string;documentNumber:string;sha256:string;deliveryAvailable:boolean}>{
  this.scope(actor);
  return this.db.transaction(client=>this.ensureInTransaction(client,contractId,actor));
 }
 private scope(actor:ScopedActor){
  const scope=schoolScope(actor);
  if(scope?.length===0)throw new ForbiddenException('ไม่อนุญาตให้เข้าถึงสัญญา / Contract access denied');
  return scope;
 }
 /** Caller owns commit/rollback so contract, rates, snapshot and PDF are atomic. */
 async ensureInTransaction(client:PoolClient,contractId:string,actor:ScopedActor):Promise<{documentId:string;documentNumber:string;sha256:string;deliveryAvailable:boolean}>{
  const scope=this.scope(actor);
  const params:unknown[]=[contractId];if(scope!==null)params.push(scope);
  // Scope is part of the lookup; no unscoped identity/artifact/settings read precedes it.
  const contract=(await client.query<ContractSource>(`SELECT c.*,s.name AS site_name,s.external_site_id,s.capacity_mwp::text AS capacity_mwp,s.school_id,
   to_char(c.start_date,'YYYY-MM-DD') AS start_date,to_char(c.end_date,'YYYY-MM-DD') AS end_date,
   to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS issue_date
   FROM contracts c JOIN sites s ON s.id=c.site_id WHERE c.id=$1 ${scope===null?'':'AND s.school_id=ANY($2::uuid[])'}`,params)).rows[0];
  if(!contract)throw new NotFoundException('ไม่พบสัญญา / Contract not found');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`contract-original:${contractId}`]);
  const existing=(await client.query<{documentId:string;documentNumber:string;sha256:string;deliveryAvailable:boolean}>(`SELECT d.id AS "documentId",d.document_number AS "documentNumber",a.sha256,(jsonb_array_length(coalesce(d.snapshot->'deliveryRecipients','[]'::jsonb))>0) AS "deliveryAvailable" FROM documents d JOIN document_artifacts a ON a.document_id=d.id WHERE d.contract_id=$1 AND d.document_type='contract'`,[contractId])).rows[0];
  if(existing)return existing;
  const issuer=(await client.query<IssuerSource>('SELECT * FROM company_profile WHERE is_configured=true ORDER BY updated_at DESC LIMIT 1')).rows[0];
  const rates=(await client.query<DocumentSnapshot['rates'][number]>(`SELECT to_char(effective_from,'YYYY-MM-DD') AS "startDate",to_char(effective_to,'YYYY-MM-DD') AS "endDate",rate::text AS rate FROM rate_versions WHERE contract_id=$1 ORDER BY effective_from,id`,[contractId])).rows;
  const allocation=await allocateDocumentNumber(client,'contract');
  const snapshot=buildContractSnapshot({...contract,document_number:allocation.number,issue_date:allocation.issueDate},issuer,rates,await this.logo());
  snapshot.deliveryRecipients=await contractDeliveryRecipients(client,contract);
  const bytes=await this.render(snapshot);const sha256=createHash('sha256').update(bytes).digest('hex');const documentId=randomUUID();
  await client.query(`INSERT INTO documents(id,site_id,contract_id,document_type,document_number,status,issue_date,snapshot,content_hash,file_key,template_version)
   VALUES($1,$2,$3,'contract',$4,'issued',$5,$6,$7,$8,$9)`,[documentId,contract.site_id,contract.id,snapshot.documentNumber,snapshot.issueDate,JSON.stringify(snapshot),sha256,`local-artifact:${documentId}`,snapshot.templateVersion]);
  await client.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[documentId,bytes,sha256]);
  return {documentId,documentNumber:snapshot.documentNumber,sha256,deliveryAvailable:snapshot.deliveryRecipients.length>0};
 }
}
