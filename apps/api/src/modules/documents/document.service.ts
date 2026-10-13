import {allocateDocumentNumber,type DocumentNumberClient,type HumanDocumentType} from './document-number.js';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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

  async next(client:DocumentNumberClient,type:DocumentType):Promise<{number:string;issueDate:string}> {
    if(!['invoice','receipt'].includes(type))throw new BadRequestException('Unsupported human document family');
    return allocateDocumentNumber(client,type as HumanDocumentType);
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
    billingCycleId?: string;
    type: DocumentType;
    year: number;
    amount?: number;
    snapshot: Record<string, unknown>;
  }): Promise<FinalDocument> {
    throw new ConflictException('Issue financial documents through the audited billing cycle workflow');
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
