import { Injectable } from "@nestjs/common";
export type ReportType = "energy" | "device_health" | "billing" | "payment" | "audit";
@Injectable()
export class ReportService {
  createCsv(_type: ReportType, rows: Record<string, unknown>[]): string {
    if (!rows.length) return "";
    const keys = Object.keys(rows[0]!);
    const escape = (value: unknown) => {
      let text=String(value ?? "");
      if(typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text="'"+text;
      return `"${text.replaceAll('"', '""')}"`;
    };
    return [keys.map(escape).join(","),...rows.map(row=>keys.map(key=>escape(row[key])).join(","))].join("\r\n");
  }
}

