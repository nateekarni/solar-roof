import { BadRequestException, Inject, Injectable } from "@nestjs/common";
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

  async getSettings(): Promise<SystemSettings> {
    const res = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings"
    );
    const map = new Map(res.rows.map((r) => [r.key, r.value]));

    return {
      invoicePrefix: map.get("invoicePrefix") ?? "INV{year}{month}",
      receiptPrefix: map.get("receiptPrefix") ?? "RCT{year}{month}",
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
    const entries = Object.entries(newSettings).filter(([_, v]) => v !== undefined);
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
      `SELECT id, company_name AS "companyName", tax_id AS "taxId", branch, address, phone, email, logo_url AS "logoUrl", updated_at AS "updatedAt"
       FROM company_profile
       ORDER BY updated_at DESC
       LIMIT 1`
    );
    if (res.rows.length === 0 || !res.rows[0]) {
      return {
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

    if (current.id) {
      await this.db.query(
        `UPDATE company_profile
         SET company_name = $1, tax_id = $2, branch = $3, address = $4, phone = $5, email = $6, logo_url = $7, updated_at = now()
         WHERE id = $8`,
        [name, taxId, branch, address, phone, email, logoUrl, current.id]
      );
    } else {
      await this.db.query(
        `INSERT INTO company_profile (company_name, tax_id, branch, address, phone, email, logo_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [name, taxId, branch, address, phone, email, logoUrl]
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
