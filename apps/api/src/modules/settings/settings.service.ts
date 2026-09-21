import { Inject, Injectable } from "@nestjs/common";
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

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getSettings(): Promise<SystemSettings> {
    const res = await this.db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings"
    );
    const map = new Map(res.rows.map((r) => [r.key, r.value]));

    return {
      invoicePrefix: map.get("invoicePrefix") ?? "INV-{year}-",
      receiptPrefix: map.get("receiptPrefix") ?? "RCT-{year}-",
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
}
