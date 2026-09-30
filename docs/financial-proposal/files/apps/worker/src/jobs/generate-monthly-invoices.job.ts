import { Injectable, Logger } from "@nestjs/common";

export interface InvoiceGenerationResult {
  billingCycleId: string;
  documentNumber: string;
  amount: number;
  created: boolean;
}

export interface InvoiceDatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

@Injectable()
export class GenerateMonthlyInvoicesJob {
  private readonly logger = new Logger(GenerateMonthlyInvoicesJob.name);

  async run(
    db: InvoiceDatabaseClient,
    periodYear: number,
    periodMonth: number
  ): Promise<InvoiceGenerationResult[]> {
    throw new Error("Monthly billing is owned by FinancialAutomationService in the API: durable 01:00 Asia/Bangkok scheduler, actual readings, accounting gate and transactional outbox. The legacy direct writer is disabled");
  }
}

