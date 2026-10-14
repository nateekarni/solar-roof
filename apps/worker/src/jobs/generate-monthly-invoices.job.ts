import { Injectable, Logger } from "@nestjs/common";

export interface InvoiceGenerationResult {
  billingCycleId: string;
  status: 'pending_issue_approval';
  amount: number;
  created: boolean;
}

export interface InvoiceDatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  transaction<T>(work:(client:Pick<InvoiceDatabaseClient,'query'>)=>Promise<T>):Promise<T>;
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
        const result=await db.transaction(async client=>{
          // Serialize every issuer on the billing cycle and recheck after the lock.
          const locked=(await client.query('SELECT * FROM billing_cycles WHERE id=$1 FOR UPDATE',[cycle.id])).rows[0];
          if(!locked)return undefined;
          if((await client.query("SELECT id FROM documents WHERE billing_cycle_id=$1 AND document_type='invoice'",[cycle.id])).rows.length)return undefined;
          const lines=locked.billing_kind==='manual'?locked.manual_lines:locked.meter_snapshot;
          if(locked.quality!=='complete'||!Array.isArray(lines)||!lines.length||!['draft','pending_review','rejected','pending_issue_approval'].includes(locked.status))return undefined;
          const created=locked.status!=='pending_issue_approval';
          if(created)await client.query("UPDATE billing_cycles SET status='pending_issue_approval' WHERE id=$1",[cycle.id]);
          return {billingCycleId:cycle.id,status:'pending_issue_approval' as const,amount:Number(locked.amount),created};
        });
        if(result)results.push(result);
      } catch (err: any) {
        this.logger.error(`Failed to generate invoice for billing cycle ${cycle.id}: ${err.message}`);
      }
    }

    return results;
  }
}
