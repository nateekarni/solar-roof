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
    const results: InvoiceGenerationResult[] = [];
    const periodStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate();
    const periodEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Find all billing cycles for this period that don't yet have an invoice
    const cyclesRes = await db.query(
      `SELECT b.id, b.site_id, b.amount, b.status
       FROM billing_cycles b
       WHERE b.period_start = $1 AND b.period_end = $2
         AND NOT EXISTS (
           SELECT 1 FROM documents d 
           WHERE d.billing_cycle_id = b.id AND d.document_type = 'invoice'
         )`,
      [periodStart, periodEnd]
    );

    for (const cycle of cyclesRes.rows) {
      try {
        const yr = String(periodYear);
        const mo = String(periodMonth).padStart(2, "0");
        const prefix = `INV${yr}${mo}`;
        const countRes = await db.query(
          `SELECT count(*)::int AS count FROM documents WHERE document_number LIKE $1`,
          [`${prefix}%`]
        );
        const seq = (countRes.rows[0]?.count ?? 0) + 1;
        const documentNumber = `${prefix}${String(seq).padStart(4, "0")}`;
        const docId = `inv-${cycle.id}`;
        const fileKey = `invoices/${periodYear}/${documentNumber}.pdf`;

        const insertRes = await db.query(
          `INSERT INTO documents (
             id, site_id, billing_cycle_id, document_type, document_number,
             status, issue_date, amount, file_key
           )
           VALUES (gen_random_uuid(), $1, $2, 'invoice', $3, 'draft', NOW(), $4, $5)
           ON CONFLICT (billing_cycle_id, document_type) DO NOTHING
           RETURNING document_number, amount`,
          [cycle.site_id, cycle.id, documentNumber, cycle.amount, fileKey]
        );

        if (insertRes.rows.length > 0) {
          results.push({
            billingCycleId: cycle.id,
            documentNumber,
            amount: Number(cycle.amount),
            created: true,
          });
        }
      } catch (err: any) {
        this.logger.error(`Failed to generate invoice for billing cycle ${cycle.id}: ${err.message}`);
      }
    }

    return results;
  }
}
