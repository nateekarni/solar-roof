import { Injectable } from "@nestjs/common";
export type ReportType = "energy" | "device_health" | "billing" | "payment" | "audit";
@Injectable()
export class ReportService { createCsv(type: ReportType, rows: Record<string, unknown>[]): string { if (!rows.length) return ""; const keys = Object.keys(rows[0]!); const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`; return [keys.join(","), ...rows.map(row => keys.map(key => escape(row[key])).join(","))].join("\n"); } }

