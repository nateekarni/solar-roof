import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from 'node:crypto';
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

export interface CompanyBankAccount {
  id: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
  promptpayId: string;
  isDefault: boolean;
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

  async getCompanyProfile(): Promise<CompanyProfile> {
    const res = await this.db.query<CompanyProfile>(
      `SELECT id, company_name AS "companyName", tax_id AS "taxId", branch, address, phone, email, logo_url AS "logoUrl", signatory_name AS "signatoryName", signatory_title AS "signatoryTitle", signature_data_uri AS "signatureDataUri", updated_at AS "updatedAt"
       FROM company_profile
       ORDER BY updated_at DESC
       LIMIT 1`
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

  async updateCompanyProfile(input: Partial<CompanyProfile>): Promise<CompanyProfile> {
    const current = await this.getCompanyProfile();
    const name = input.companyName ?? current.companyName;
    const taxId = input.taxId ?? current.taxId;
    const branch = input.branch ?? current.branch;
    const address = input.address ?? current.address;
    const phone = input.phone ?? current.phone;
    const email = input.email ?? current.email;
    const logoUrl = input.logoUrl ?? current.logoUrl ?? null;

    const signatoryName = input.signatoryName?.trim() ?? current.signatoryName ?? '';
    const signatoryTitle = input.signatoryTitle?.trim() ?? current.signatoryTitle ?? '';

    const signatureDataUri = input.signatureDataUri ?? current.signatureDataUri ?? '';
    if (signatureDataUri && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(signatureDataUri) || signatureDataUri.length > 1400000)) throw new BadRequestException('Signature must be a PNG/JPEG image up to 1 MB');
    if (current.id) {
      await this.db.query(
        `UPDATE company_profile
         SET company_name = $1, tax_id = $2, branch = $3, address = $4, phone = $5, email = $6, logo_url = $7, signatory_name = $8, signatory_title = $9, signature_data_uri = $10, updated_at = now()
         WHERE id = $11`,
        [name, taxId, branch, address, phone, email, logoUrl, signatoryName, signatoryTitle, signatureDataUri, current.id]
      );
    } else {
      await this.db.query(
        `INSERT INTO company_profile (company_name, tax_id, branch, address, phone, email, logo_url, signatory_name, signatory_title, signature_data_uri, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [name, taxId, branch, address, phone, email, logoUrl, signatoryName, signatoryTitle, signatureDataUri]
      );
    }
    return this.getCompanyProfile();
  }

  async listBankAccounts(): Promise<CompanyBankAccount[]> {
    const res = await this.db.query<CompanyBankAccount>(
      `SELECT id, bank_name AS "bankName", bank_code AS "bankCode", account_name AS "accountName",
              account_number AS "accountNumber", branch_name AS "branchName", promptpay_id AS "promptpayId",
              is_default AS "isDefault", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM company_bank_accounts
       ORDER BY is_default DESC, created_at ASC`
    );
    return res.rows;
  }

  async saveBankAccount(data: Partial<CompanyBankAccount>): Promise<CompanyBankAccount> {
    if (!data.id && (!data.bankName?.trim() || !data.accountName?.trim() || !data.accountNumber?.trim())) {
      throw new BadRequestException("Bank name, account name and account number are required");
    }
    if (data.isDefault) {
      await this.db.query("UPDATE company_bank_accounts SET is_default = false");
    }

    if (data.id) {
      const res = await this.db.query<CompanyBankAccount>(
        `UPDATE company_bank_accounts
         SET bank_name = coalesce($1, bank_name),
             bank_code = coalesce($2, bank_code),
             account_name = coalesce($3, account_name),
             account_number = coalesce($4, account_number),
             branch_name = coalesce($5, branch_name),
             promptpay_id = coalesce($6, promptpay_id),
             is_default = coalesce($7, is_default),
             updated_at = now()
         WHERE id = $8
         RETURNING id, bank_name AS "bankName", bank_code AS "bankCode", account_name AS "accountName",
                   account_number AS "accountNumber", branch_name AS "branchName", promptpay_id AS "promptpayId",
                   is_default AS "isDefault"`,
        [data.bankName, data.bankCode, data.accountName, data.accountNumber, data.branchName, data.promptpayId, data.isDefault, data.id]
      );
      if (!res.rows[0]) throw new Error("Failed to update bank account");
      return res.rows[0];
    } else {
      const res = await this.db.query<CompanyBankAccount>(
        `INSERT INTO company_bank_accounts 
         (bank_name, bank_code, account_name, account_number, branch_name, promptpay_id, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, true))
         RETURNING id, bank_name AS "bankName", bank_code AS "bankCode", account_name AS "accountName",
                   account_number AS "accountNumber", branch_name AS "branchName", promptpay_id AS "promptpayId",
                   is_default AS "isDefault"`,
        [
          data.bankName,
          data.bankCode || "",
          data.accountName,
          data.accountNumber,
          data.branchName || "",
          data.promptpayId || "",
          data.isDefault ?? true,
        ]
      );
      if (!res.rows[0]) throw new Error("Failed to insert bank account");
      return res.rows[0];
    }
  }

  async deleteBankAccount(id: string): Promise<boolean> {
    await this.db.query("DELETE FROM company_bank_accounts WHERE id = $1", [id]);
    return true;
  }
}
