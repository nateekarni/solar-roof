import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
export type DocumentType = "invoice" | "receipt" | "billing_statement";
export interface FinalDocument { id: string; publicId: string; type: DocumentType; year: number; number: string; contentHash: string; status: "finalized" | "cancelled"; snapshot: Record<string, unknown>; issuedAt: Date; cancelledAt?: Date; }
@Injectable()
export class NumberSeriesService { private readonly counters = new Map<string, number>(); async next(type: DocumentType, year: number): Promise<string> { const key = `${type}:${year}`; const next = (this.counters.get(key) ?? 0) + 1; this.counters.set(key, next); return `${type.slice(0, 3).toUpperCase()}-${year}-${String(next).padStart(6, "0")}`; } }
@Injectable()
export class DocumentService {
  private readonly docs = new Map<string, FinalDocument>();
  constructor(private readonly series: NumberSeriesService) {}
  async finalize(input: { id?: string; type: DocumentType; year: number; snapshot: Record<string, unknown> }): Promise<FinalDocument> { const id = input.id ?? randomUUID(); if (this.docs.has(id)) throw new ConflictException("Document is already finalized"); const number = await this.series.next(input.type, input.year); const contentHash = createHash("sha256").update(JSON.stringify(input.snapshot)).digest("hex"); const doc = { id, publicId: randomUUID(), type: input.type, year: input.year, number, contentHash, status: "finalized" as const, snapshot: structuredClone(input.snapshot), issuedAt: new Date() }; this.docs.set(id, doc); return doc; }
  get(id: string): FinalDocument { const doc = this.docs.get(id); if (!doc) throw new NotFoundException("Document not found"); return doc; }
  list(): FinalDocument[] { return [...this.docs.values()]; }
  cancel(id: string): FinalDocument { const doc = this.get(id); if (doc.status === "cancelled") return doc; doc.status = "cancelled"; doc.cancelledAt = new Date(); return doc; }
}
