import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

export type DocumentType = "invoice" | "receipt" | "billing_statement";

export interface FinalDocument {
  id: string;
  publicId: string;
  type: DocumentType;
  year: number;
  number: string;
  contentHash: string;
  status: "finalized" | "cancelled";
  snapshot: Record<string, unknown>;
  issuedAt: Date;
  cancelledAt?: Date;
}

@Injectable()
export class NumberSeriesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async next(type: DocumentType, year: number): Promise<string> {
    const prefix = type === "receipt" ? "RCT" : type === "billing_statement" ? "STM" : "INV";
    const res = await this.db.query(
      `SELECT count(*)::int AS count 
       FROM documents 
       WHERE document_type = $1 
         AND EXTRACT(year FROM coalesce(issue_date, created_at)) = $2`,
      [type, year]
    );
    const count = (res.rows[0]?.count ?? 0) + 1;
    return `${prefix}-${year}-${String(count).padStart(6, "0")}`;
  }
}

@Injectable()
export class DocumentService {
  private readonly docs = new Map<string, FinalDocument>();

  constructor(
    @Inject(NumberSeriesService) private readonly series: NumberSeriesService,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  async finalize(input: {
    id?: string;
    siteId?: string;
    type: DocumentType;
    year: number;
    amount?: number;
    snapshot: Record<string, unknown>;
  }): Promise<FinalDocument> {
    const id = input.id ?? randomUUID();
    if (this.docs.has(id)) {
      throw new ConflictException("Document is already finalized");
    }

    const number = await this.series.next(input.type, input.year);
    const contentHash = createHash("sha256").update(JSON.stringify(input.snapshot)).digest("hex");
    const now = new Date();

    const doc: FinalDocument = {
      id,
      publicId: randomUUID(),
      type: input.type,
      year: input.year,
      number,
      contentHash,
      status: "finalized",
      snapshot: structuredClone(input.snapshot),
      issuedAt: now,
    };

    this.docs.set(id, doc);

    const siteId = input.siteId || (input.snapshot?.siteId as string);
    if (siteId && this.db) {
      await this.db.query(
        `INSERT INTO documents (id, site_id, document_type, document_number, status, issue_date, amount, file_key, created_at)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $5)`,
        [id, siteId, input.type, number, now, input.amount ?? 0, `docs/${input.type}-${number}.pdf`]
      );
    }

    return doc;
  }

  get(id: string): FinalDocument {
    const doc = this.docs.get(id);
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  list(): FinalDocument[] {
    return [...this.docs.values()];
  }

  async listFromDb(): Promise<any[]> {
    const res = await this.db.query("SELECT * FROM documents ORDER BY created_at DESC");
    return res.rows;
  }

  cancel(id: string): FinalDocument {
    const doc = this.get(id);
    if (doc.status === "cancelled") return doc;
    doc.status = "cancelled";
    doc.cancelledAt = new Date();
    return doc;
  }
}
