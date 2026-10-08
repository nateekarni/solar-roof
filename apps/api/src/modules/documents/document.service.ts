import {allocateDocumentNumber,type DocumentNumberClient,type HumanDocumentType} from './document-number.js';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
    const id = input.id ?? randomUUID();
    if (this.docs.has(id)) {
      throw new ConflictException("Document is already finalized");
    }

    const siteId = input.siteId || (input.snapshot?.siteId as string);
    if(!siteId)throw new BadRequestException('siteId is required');
    const doc=await this.db.transaction(async client=>{
      const {number,issueDate}=await this.series.next(client,input.type);
      const contentHash=createHash('sha256').update(JSON.stringify(input.snapshot)).digest('hex');
      const now=new Date();
      const result:FinalDocument={id,publicId:randomUUID(),type:input.type,year:Number(issueDate.slice(0,4)),number,contentHash,status:'finalized',snapshot:structuredClone(input.snapshot),issuedAt:now};
      await client.query(
        `INSERT INTO documents(id,site_id,document_type,document_number,status,issue_date,amount,file_key,created_at,billing_cycle_id)
         VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9)`,
        [id,siteId,input.type,number,issueDate,input.amount??0,`docs/${number}.pdf`,now,input.billingCycleId??null]);
      return result;
    });
    this.docs.set(id,doc);

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
