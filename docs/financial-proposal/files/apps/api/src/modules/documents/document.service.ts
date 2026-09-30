import { schoolScope, type ScopePrincipal } from "../../common/auth/resource-scope.js";
import { readOriginalPdf } from './original-document-storage.js';
import { ForbiddenException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { inFinancialTransaction, issueCycleDocument, nextDocumentNumber, auditFinancial } from "../billing/financial-persistence.js";
export type DocumentType = "invoice" | "receipt" | "billing_statement";
export interface FinalDocument {
  id: string; publicId: string; type: DocumentType; year: number; number: string;
  contentHash: string; status: "finalized" | "cancelled"; snapshot: Record<string, unknown>;
  issuedAt: Date; cancelledAt?: Date;
}
@Injectable()
export class NumberSeriesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async next(type: DocumentType, year: number): Promise<string> {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new ConflictException("Invalid numbering year");
    return inFinancialTransaction(this.db, client => nextDocumentNumber(client,type,new Date(Date.UTC(year,0,1))));
  }
}
@Injectable()
export class DocumentService {
  constructor(@Inject(NumberSeriesService) private readonly series: NumberSeriesService, @Inject(DatabaseService) private readonly db: DatabaseService) {}
  /** Legacy callers must supply the persisted billing cycle; caller amounts/snapshots cannot issue financial documents. */
  async finalize(input: {id?:string;siteId?:string;type:DocumentType;year:number;amount?:number;snapshot:Record<string,unknown>}):Promise<FinalDocument> {
    const cycleId=input.snapshot.billingCycleId;
    if(typeof cycleId!=="string" || !["invoice","receipt"].includes(input.type)) throw new ConflictException("Use a persisted approved billing cycle to issue this document");
    const docId=await inFinancialTransaction(this.db,async client=>{
      const cycle=(await client.query(`SELECT b.*,to_char(b.period_start,'YYYY-MM-DD') AS period_start,to_char(b.period_end,'YYYY-MM-DD') AS period_end FROM billing_cycles b WHERE id=$1 FOR UPDATE`,[cycleId])).rows[0];
      if(!cycle) throw new NotFoundException("Billing cycle not found");
      if(input.type==='receipt' ? cycle.status!=='paid' : !['approved','finalized','paid'].includes(cycle.status)) throw new ConflictException("Billing cycle is not eligible for issue");
      const doc=await issueCycleDocument(client,cycle,input.type as 'invoice'|'receipt');
      await auditFinancial(client,cycleId,'document.issued',null,null,{documentId:doc.id});
      return doc.id as string;
    });
    return this.get(docId);
  }
  private fromRow(row:any):FinalDocument {
    return {id:row.id,publicId:row.id,type:row.document_type,year:new Date(row.issue_date).getUTCFullYear(),number:row.document_number,contentHash:row.content_hash,status:row.status==='cancelled'?'cancelled':'finalized',snapshot:row.snapshot,issuedAt:new Date(row.issue_date)};
  }
  async get(id:string):Promise<FinalDocument> {
    const row=(await this.db.query("SELECT * FROM documents WHERE id=$1 AND snapshot IS NOT NULL AND status IN ('issued','finalized','cancelled')",[id])).rows[0];
    if(!row) throw new NotFoundException("Issued document snapshot not found");
    return this.fromRow(row);
  }
  async list():Promise<FinalDocument[]> {
    const res=await this.db.query("SELECT * FROM documents WHERE snapshot IS NOT NULL AND status IN ('issued','finalized','cancelled') ORDER BY created_at DESC");
    return res.rows.map(row=>this.fromRow(row));
  }
  async listFromDb():Promise<any[]> { return (await this.db.query("SELECT * FROM documents ORDER BY created_at DESC")).rows; }
  async download(id:string,user?:ScopePrincipal):Promise<{bytes:Buffer;sha256:string;filename:string}> {
    const scope=schoolScope(user);
    if(scope?.length===0)throw new ForbiddenException('No school assigned');
    const row=(await this.db.query(`SELECT d.document_number,d.file_key,a.pdf_bytes,a.sha256 FROM documents d JOIN sites s ON s.id=d.site_id LEFT JOIN document_artifacts a ON a.document_id=d.id WHERE d.id=$1 AND ($2::uuid[] IS NULL OR s.school_id=ANY($2::uuid[]))`,[id,scope])).rows[0];
    if(!row)throw new NotFoundException('Document not found');
    if(!row.pdf_bytes && row.file_key) {
      try {const original=await readOriginalPdf(row.file_key);row.pdf_bytes=original.bytes;row.sha256=original.sha256;}
      catch {throw new ConflictException('Stored original PDF could not be retrieved; historical documents are never reconstructed');}
    }
    if(!row.pdf_bytes)throw new ConflictException('Original PDF unavailable or still pending generation; historical documents are never reconstructed');
    return {bytes:row.pdf_bytes,sha256:row.sha256,filename:`${String(row.document_number??id).replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf`};
  }
  async cancel(_id:string):Promise<FinalDocument> { throw new ConflictException("Cancellation requires an approved credit/correction workflow; direct cancellation is disabled"); }
}

