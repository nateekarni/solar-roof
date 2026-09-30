import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

import { parsePaymentTermDays, validateReminderSchedule } from "./financial-settings-policy.js";

export interface SystemSettings {
  defaultPaymentTermDays: number | null;
  financialRemindersEnabled: boolean;
  financialReminderDays: number[];
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
      defaultPaymentTermDays: map.has("defaultPaymentTermDays") ? parsePaymentTermDays(Number(map.get("defaultPaymentTermDays"))) : null,
      financialRemindersEnabled: map.get("financialRemindersEnabled") === "true",
      financialReminderDays: JSON.parse(map.get("financialReminderDays") ?? "[]"),
      invoicePrefix: map.get("invoicePrefix") ?? "INV{year}{month}",
      receiptPrefix: map.get("receiptPrefix") ?? "RCT{year}{month}",
      rawTelemetryRetentionYears: Number(map.get("rawTelemetryRetentionYears") ?? 2),
      aggregateRetentionYears: Number(map.get("aggregateRetentionYears") ?? 7),
      language: map.get("language") ?? "th",
      criticalEmailAlert: map.get("criticalEmailAlert") === "true",
      inAppNotification: map.get("inAppNotification") !== "false",
      ...(map.has("defaultUnitPriceThb") && Number.isFinite(Number(map.get("defaultUnitPriceThb"))) ? {defaultUnitPriceThb:Number(map.get("defaultUnitPriceThb"))} : {}),
      defaultFetchFrequencySec: Number(map.get("defaultFetchFrequencySec") ?? 60),
    };
  }

  async updateSettings(newSettings: Partial<SystemSettings>): Promise<SystemSettings> {
    const allowed = new Set(["defaultPaymentTermDays", "financialRemindersEnabled", "financialReminderDays", "invoicePrefix", "receiptPrefix", "rawTelemetryRetentionYears", "aggregateRetentionYears", "language", "criticalEmailAlert", "inAppNotification", "defaultUnitPriceThb", "defaultFetchFrequencySec"]);
    if (Object.keys(newSettings).some(key => !allowed.has(key))) throw new BadRequestException("Unknown setting");
    try { if (Object.hasOwn(newSettings, "defaultPaymentTermDays")) parsePaymentTermDays(newSettings.defaultPaymentTermDays); }
    catch (error) { throw new BadRequestException((error as Error).message); }
    await this.db.transaction(async client => {
      // Serialise schedule read/modify/write, including absent keys on a new install.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('financial-system-settings'))");
      const stored = await client.query<{key:string;value:string}>("SELECT key,value FROM system_settings WHERE key IN ('financialRemindersEnabled','financialReminderDays')");
      const map = new Map(stored.rows.map(row => [row.key,row.value]));
      const enabled = Object.hasOwn(newSettings, "financialRemindersEnabled") ? newSettings.financialRemindersEnabled : map.get("financialRemindersEnabled") === "true";
      const days = Object.hasOwn(newSettings, "financialReminderDays") ? newSettings.financialReminderDays : JSON.parse(map.get("financialReminderDays") ?? "[]");
      try { validateReminderSchedule(enabled, days); }
      catch (error) { throw new BadRequestException((error as Error).message); }
      for (const [key,value] of Object.entries(newSettings).filter(([,value]) => value !== undefined)) {
        if (key === "defaultPaymentTermDays" && value === null) { await client.query("DELETE FROM system_settings WHERE key=$1",[key]); continue; }
        await client.query(
          "INSERT INTO system_settings(key,value,updated_at) VALUES($1,$2,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()",
          [key,Array.isArray(value) ? JSON.stringify(value) : String(value)]
        );
      }
    });
    return this.getSettings();
  }

  async getCompanyProfile(): Promise<CompanyProfile> {
    const res = await this.db.query<CompanyProfile>(
      `SELECT id, company_name AS "companyName", tax_id AS "taxId", branch, address, phone, email, logo_url AS "logoUrl", updated_at AS "updatedAt"
       FROM company_profile
       WHERE is_configured=true
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
       WHERE is_configured=true
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
         SET is_configured=true, bank_name = coalesce($1, bank_name),
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
