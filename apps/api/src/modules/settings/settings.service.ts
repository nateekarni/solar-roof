import { BadRequestException, ConflictException, NotFoundException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { decodeCompanyImage } from './company-image.js';
import { financialConfigurationHash, financialAuditEvidence } from '../financial-readiness/financial-configuration.js';
import { DOMAIN_SETTING_DEFAULTS, validateSettingsPatch } from './domain-settings.js';
import type { PermissionDomain } from '../../common/auth/authorization.js';
import { DatabaseService } from "../../database/database.service.js";

export interface SystemSettings {
  invoicePrefix: string;
  receiptPrefix: string;
  rawTelemetryRetentionYears: number;
  aggregateRetentionYears: number;
  language: string;
  criticalEmailAlert: boolean;
  inAppNotification: boolean;
  defaultUnitPriceThb?: number;
  defaultFetchFrequencySec?: number;
}

export interface CompanyProfile {
  id?: string;
  companyName: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  signatureDataUri?: string;
  updatedAt?: string;
}

/** Public settings contain company facts and branding, not personal document identity. */
export type CompanySettingsProfile = Omit<CompanyProfile, 'signatoryName' | 'signatoryTitle' | 'signatureDataUri'>;

function companySettingsProfile(profile: CompanyProfile): CompanySettingsProfile {
  const {id, companyName, taxId, branch, address, phone, email, logoUrl, updatedAt} = profile;
  return {companyName, taxId, branch, address, phone, email,
    ...(id !== undefined ? {id} : {}),
    ...(logoUrl !== undefined ? {logoUrl} : {}),
    ...(updatedAt !== undefined ? {updatedAt} : {})};
}

export interface CompanyBankAccount {
  id: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
  promptpayId: string;
  isDefault: boolean;
  isConfigured: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getDomainSettings(domain:PermissionDomain){
    const keys=Object.keys(DOMAIN_SETTING_DEFAULTS[domain]);
    const rows=(await this.db.query('SELECT key,value FROM system_settings WHERE key=ANY($1::text[])',[keys])).rows;
    const settings={...DOMAIN_SETTING_DEFAULTS[domain]};
    for(const row of rows)settings[row.key]=typeof settings[row.key]==='boolean'?row.value==='true':Number(row.value);
    const revision=Number((await this.db.query('SELECT revision FROM settings_domain_revisions WHERE domain=$1',[domain])).rows[0]?.revision??0);
    return {domain,revision,settings};
  }
  async updateDomainSettings(domain:PermissionDomain,input:unknown,actorId:string){
    const body=validateSettingsPatch(domain,input);
    await this.db.transaction(async client=>{
      const current=(await client.query('SELECT revision FROM settings_domain_revisions WHERE domain=$1 FOR UPDATE',[domain])).rows[0];
      if(current?.revision!==body.revision)throw new ConflictException('Settings changed; reload before saving');
      for(const [key,value]of Object.entries(body.settings))await client.query(`INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,[key,String(value)]);
      await client.query('UPDATE settings_domain_revisions SET revision=revision+1 WHERE domain=$1',[domain]);
      await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id) VALUES($1,$2,$3,'settings',$4,$5)`,[randomUUID(),actorId,`${domain}.settings.updated`,domain,randomUUID()]);
    });
    return this.getDomainSettings(domain);
  }

  async getSettings(): Promise<SystemSettings> {
    const res = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings"
    );
    const map = new Map(res.rows.map((r) => [r.key, r.value]));

    return {
      invoicePrefix: "INV{YY}{MM}",
      receiptPrefix: "RCP{YY}{MM}",
      rawTelemetryRetentionYears: Number(map.get("rawTelemetryRetentionYears") ?? 2),
      aggregateRetentionYears: Number(map.get("aggregateRetentionYears") ?? 7),
      language: map.get("language") ?? "th",
      criticalEmailAlert: map.get("criticalEmailAlert") === "true",
      inAppNotification: map.get("inAppNotification") !== "false",
      defaultUnitPriceThb: Number(map.get("defaultUnitPriceThb") ?? 4.25),
      defaultFetchFrequencySec: Number(map.get("defaultFetchFrequencySec") ?? 60),
    };
  }

  async updateSettings(newSettings: Partial<SystemSettings>): Promise<SystemSettings> {
    const entries = Object.entries(newSettings).filter(([key, v]) => v !== undefined && !["invoicePrefix","receiptPrefix"].includes(key));
    for (const [k, v] of entries) {
      await this.db.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [k, String(v)]
      );
    }
    return this.getSettings();
  }

  async getCompanyProfile(client: Pick<DatabaseService, 'query'> = this.db, lock = false): Promise<CompanySettingsProfile> {
    return companySettingsProfile(await this.getStoredCompanyProfile(client, lock));
  }

  private async getStoredCompanyProfile(client: Pick<DatabaseService, 'query'> = this.db, lock = false): Promise<CompanyProfile> {
    const res = await client.query<CompanyProfile>(
      `SELECT id, company_name AS "companyName", tax_id AS "taxId", branch, address, phone, email, logo_url AS "logoUrl", signatory_name AS "signatoryName", signatory_title AS "signatoryTitle", signature_data_uri AS "signatureDataUri", updated_at AS "updatedAt"
       FROM company_profile
       ORDER BY updated_at DESC
       LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`
    );
    if (res.rows.length === 0 || !res.rows[0]) {
      return {
        signatoryName: "",
        signatoryTitle: "",
        companyName: "",
        taxId: "",
        branch: "",
        address: "",
        phone: "",
        email: "",
      };
    }
    return res.rows[0];
  }

  async updateCompanyProfile(input: Partial<CompanySettingsProfile>, actorId: string): Promise<CompanySettingsProfile> {
    const logo = input.logoUrl === undefined ? undefined : decodeCompanyImage(input.logoUrl, 'Logo')?.dataUri ?? '';
    return this.db.transaction(async client => {
      await this.lockFinancialConfiguration(client);
      const current = await this.getStoredCompanyProfile(client, true);
      const banks = await this.listBankAccounts(client, true);
      const before = canonicalGlobalFinancialConfiguration(current, banks);
      const next = {...current,
        companyName: input.companyName ?? current.companyName,
        taxId: input.taxId ?? current.taxId,
        branch: input.branch ?? current.branch,
        address: input.address ?? current.address,
        phone: input.phone ?? current.phone,
        email: input.email ?? current.email,
        logoUrl: logo ?? current.logoUrl ?? '',
      };
      const values = [next.companyName,next.taxId,next.branch,next.address,next.phone,next.email,next.logoUrl];
      if(current.id) await client.query(`UPDATE company_profile SET company_name=$1,tax_id=$2,branch=$3,address=$4,phone=$5,email=$6,logo_url=$7,updated_at=now() WHERE id=$8`,[...values,current.id]);
      else await client.query(`INSERT INTO company_profile(company_name,tax_id,branch,address,phone,email,logo_url,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())`,values);
      const saved = await this.getStoredCompanyProfile(client);
      const after=canonicalGlobalFinancialConfiguration(saved,banks);
      await this.auditFinancialMutation(client, actorId, 'company.profile.updated', saved.id!,financialAuditEvidence(before),financialAuditEvidence(after));
      await this.revokeChangedApproval(client,actorId,before,after);
      return companySettingsProfile(saved);
    });
  }

  async listBankAccounts(client: Pick<DatabaseService, 'query'> = this.db, lock = false): Promise<CompanyBankAccount[]> {
    const res = await client.query<CompanyBankAccount>(
      `SELECT id, bank_name AS "bankName", bank_code AS "bankCode", account_name AS "accountName",
              account_number AS "accountNumber", branch_name AS "branchName", promptpay_id AS "promptpayId",
              is_default AS "isDefault", is_configured AS "isConfigured", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM company_bank_accounts
       ORDER BY is_default DESC, created_at ASC, id ASC ${lock ? 'FOR UPDATE' : ''}`
    );
    return res.rows;
  }

  async saveBankAccount(data: Partial<CompanyBankAccount>, actorId: string): Promise<CompanyBankAccount> {
    return this.db.transaction(async client => {
      await this.lockFinancialConfiguration(client);
      const company = await this.getStoredCompanyProfile(client, true);
      const banks = await this.listBankAccounts(client, true);
      const before = canonicalGlobalFinancialConfiguration(company,banks);
      const current = data.id ? banks.find(bank => bank.id === data.id) : undefined;
      if(data.id && !current) throw new NotFoundException('Bank account not found');
      const next = {...current,...Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined))};
      if(!next.bankName?.trim() || !next.accountName?.trim() || !next.accountNumber?.trim()) throw new BadRequestException('Bank name, account name and account number are required');
      if(data.isDefault) await client.query('UPDATE company_bank_accounts SET is_default = false');
      let id = data.id;
      if(id) await client.query(`UPDATE company_bank_accounts SET bank_name=coalesce($1,bank_name),bank_code=coalesce($2,bank_code),account_name=coalesce($3,account_name),account_number=coalesce($4,account_number),branch_name=coalesce($5,branch_name),promptpay_id=coalesce($6,promptpay_id),is_default=coalesce($7,is_default),updated_at=now() WHERE id=$8`,[data.bankName,data.bankCode,data.accountName,data.accountNumber,data.branchName,data.promptpayId,data.isDefault,id]);
      else {
        const inserted = await client.query<{id:string}>(`INSERT INTO company_bank_accounts(bank_name,bank_code,account_name,account_number,branch_name,promptpay_id,is_default) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[next.bankName,next.bankCode??'',next.accountName,next.accountNumber,next.branchName??'',next.promptpayId??'',data.isDefault??false]);
        id = inserted.rows[0]!.id;
      }
      const after = await this.ensureDefaultBank(client,data.isDefault ? id : undefined);
      const snapshot=canonicalGlobalFinancialConfiguration(company,after);
      await this.auditFinancialMutation(client,actorId,data.id?'company.bank.updated':'company.bank.created',id!,financialAuditEvidence(before),financialAuditEvidence(snapshot));
      await this.revokeChangedApproval(client,actorId,before,snapshot);
      return after.find(bank=>bank.id===id)!;
    });
  }

  async deleteBankAccount(id: string, actorId: string): Promise<boolean> {
    return this.db.transaction(async client => {
      await this.lockFinancialConfiguration(client);
      const company = await this.getStoredCompanyProfile(client,true);
      const banks = await this.listBankAccounts(client,true);
      if(!banks.some(bank=>bank.id===id)) throw new NotFoundException('Bank account not found');
      const before = canonicalGlobalFinancialConfiguration(company,banks);
      await client.query('DELETE FROM company_bank_accounts WHERE id = $1',[id]);
      const after = await this.ensureDefaultBank(client);
      const snapshot=canonicalGlobalFinancialConfiguration(company,after);
      await this.auditFinancialMutation(client,actorId,'company.bank.deleted',id,financialAuditEvidence(before),financialAuditEvidence(snapshot));
      await this.revokeChangedApproval(client,actorId,before,snapshot);
      return true;
    });
  }

  private async lockFinancialConfiguration(client: PoolClient) {
    // Also acquired by production approval creation, including when no rows exist.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('production-financial-configuration'))");
  }

  private async ensureDefaultBank(client: PoolClient, preferredId?: string) {
    const banks = await this.listBankAccounts(client);
    const configured = banks.filter(bank=>bank.isConfigured);
    const oldest = [...configured].sort((a,b)=>new Date(a.createdAt ?? 0).valueOf() - new Date(b.createdAt ?? 0).valueOf() || a.id.localeCompare(b.id))[0];
    const id = configured.find(bank=>bank.id===preferredId)?.id ?? configured.find(bank=>bank.isDefault)?.id ?? oldest?.id;
    if(id) await client.query('UPDATE company_bank_accounts SET is_default = (id = $1), updated_at=CASE WHEN is_default IS DISTINCT FROM (id = $1) THEN now() ELSE updated_at END',[id]);
    else await client.query('UPDATE company_bank_accounts SET is_default = false WHERE is_default = true');
    return this.listBankAccounts(client);
  }

  private async auditFinancialMutation(client: PoolClient, actorId: string, action: string, entityId: string,before:unknown,after:unknown) {
    await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),actorId,action,action.startsWith('finance.')?'financial_readiness_approval':action.startsWith('company.bank.')?'company_bank_account':'company_profile',entityId,JSON.stringify(before),JSON.stringify(after),randomUUID()]);
  }

  private async revokeChangedApproval(client: PoolClient, actorId: string, before: unknown, after: unknown) {
    if(financialConfigurationHash(before)===financialConfigurationHash(after)) return;
    const revoked = await client.query<{id:string;config_hash:string;revoked_at:Date}>(`UPDATE financial_readiness_approvals SET revoked_at=now(),revoked_by=$1,revoke_reason='financial_configuration_changed' WHERE scope='PRODUCTION' AND revoked_at IS NULL RETURNING id,config_hash,revoked_at`,[actorId]);
    for(const approval of revoked.rows) await this.auditFinancialMutation(client,actorId,'finance.approval.revoked',approval.id,
      {id:approval.id,status:'active',configHash:approval.config_hash,configuration:financialAuditEvidence(before)},
      {id:approval.id,status:'revoked',configHash:approval.config_hash,revokedAt:approval.revoked_at,revokedBy:actorId,reason:'financial_configuration_changed',configuration:financialAuditEvidence(after)});
  }
}

/** Explicit financial fields exclude storage timestamps and retain deterministic bank ordering. */
export function canonicalGlobalFinancialConfiguration(company: CompanyProfile, banks: CompanyBankAccount[]) {
  return {company:{companyName:company.companyName,taxId:company.taxId,branch:company.branch,address:company.address,phone:company.phone,email:company.email,logoUrl:company.logoUrl??''},
    banks:[...banks].sort((a,b)=>a.id.localeCompare(b.id)).map(bank=>({id:bank.id,bankName:bank.bankName,bankCode:bank.bankCode,accountName:bank.accountName,accountNumber:bank.accountNumber,branchName:bank.branchName,promptpayId:bank.promptpayId,isDefault:bank.isDefault}))};
}
