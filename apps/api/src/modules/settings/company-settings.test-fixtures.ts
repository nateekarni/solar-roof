import type { DatabaseService } from '../../database/database.service.js';
import type { CompanyBankAccount, CompanyProfile } from './settings.service.js';

export const testCompany: CompanyProfile = {id:'company-a',companyName:'Issuer',taxId:'1234567890123',branch:'Head office',address:'Address',phone:'02',email:'issuer@example.test',logoUrl:'',signatoryName:'Director',signatoryTitle:'Owner',signatureDataUri:''};
type ConfiguredBank = CompanyBankAccount & {isConfigured:boolean};
export function bank(id: string, isDefault = false, isConfigured = true): ConfiguredBank {
  return {id,bankName:'Bank',bankCode:'bank',accountName:'Issuer',accountNumber:id,branchName:'Branch',promptpayId:'',isDefault,isConfigured,createdAt:id,updatedAt:'initial'};
}

/** Stateful external SQL boundary: commits, rollback and returned rows are observable. */
export function settingsDatabase(company = {...testCompany}, banks: ConfiguredBank[] = [bank('bank-a',true)]) {
  let state = {company, banks, approval:{id:'approval-a',revokedBy:null as string|null}, audits:[] as {actor:string;action:string;entity:string;before:any;after:any}[]};
  const statements: {sql:string;transaction:boolean}[] = [];
  let inTransaction = false;
  let failAudit = false;
  async function query(sql: string, p: any[] = []) {
    statements.push({sql,transaction:inTransaction});
    if(sql.includes('pg_advisory_xact_lock')) return {rows:[]};
    if(sql.includes('SELECT')&&sql.includes('FROM company_profile')) return {rows:state.company.id?[{...state.company}]:[]};
    if(sql.includes('SELECT')&&sql.includes('FROM company_bank_accounts')) return {rows:state.banks.map(b=>{
      const {isConfigured,...fields}=b;
      return sql.includes('is_configured AS "isConfigured"')?{...fields,isConfigured}:fields;
    }).sort((a,b)=>a.id.localeCompare(b.id))};
    if(sql.includes('UPDATE company_profile')||sql.includes('INSERT INTO company_profile')) {
      state.company={...state.company,id:state.company.id??'company-new',companyName:p[0],taxId:p[1],branch:p[2],address:p[3],phone:p[4],email:p[5],logoUrl:p[6]};
      if(sql.includes('signatory_name=')) Object.assign(state.company,{signatoryName:p[7],signatoryTitle:p[8],signatureDataUri:p[9]});
      return {rows:[{...state.company}]};
    }
    if(sql.includes('UPDATE company_bank_accounts SET is_default = false')) {state.banks.forEach(b=>b.isDefault=false);return {rows:[]};}
    if(sql.includes('UPDATE company_bank_accounts SET is_default = (id = $1)')) {state.banks.forEach(b=>b.isDefault=b.id===p[0]);return {rows:[]};}
    if(sql.includes('INSERT INTO company_bank_accounts')) {
      const b:ConfiguredBank={id:'bank-new',bankName:p[0],bankCode:p[1],accountName:p[2],accountNumber:p[3],branchName:p[4],promptpayId:p[5],isDefault:p[6],isConfigured:true,createdAt:'bank-new'};
      state.banks.push(b);return {rows:[{...b}]};
    }
    if(sql.includes('UPDATE company_bank_accounts')) {
      const b=state.banks.find(b=>b.id===p[7]); if(!b)return {rows:[]};
      const keys = ['bankName','bankCode','accountName','accountNumber','branchName','promptpayId','isDefault'] as const;
      keys.forEach((key,i)=>{if(p[i]!=null)(b as any)[key]=p[i];});return {rows:[{...b}]};
    }
    if(sql.includes('DELETE FROM company_bank_accounts')) {state.banks=state.banks.filter(b=>b.id!==p[0]);return {rows:[]};}
    if(sql.includes('UPDATE financial_readiness_approvals')) {
      if(state.approval.revokedBy)return {rows:[]};state.approval.revokedBy=p[0];return {rows:[{id:state.approval.id}]};
    }
    if(sql.includes('INSERT INTO audit_events')) {
      if(failAudit)throw Error('Audit unavailable');state.audits.push({actor:p[1],action:p[2],entity:p[3],before:sql.includes('before_json')?JSON.parse(p[5]):undefined,after:sql.includes('after_json')?JSON.parse(p[6]):undefined});return {rows:[]};
    }
    throw Error(`Unhandled SQL: ${sql}`);
  }
  const db={query,transaction:async<T>(work:(client:any)=>Promise<T>)=>{
    const before=structuredClone(state);inTransaction=true;
    try{return await work({query});}catch(error){state=before;throw error;}finally{inTransaction=false;}
  }} as unknown as DatabaseService;
  return {db,get state(){return state;},statements,failAudit(){failAudit=true;}};
}
