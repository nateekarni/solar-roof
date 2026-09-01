import { Injectable } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
@Injectable()
export class VerificationService { constructor(private readonly documents: DocumentService) {} verify(publicId: string, hash: string): { valid: boolean; documentId?: string } { const doc = this.documents.list().find(item => item.publicId === publicId); return doc ? { valid: doc.status === "finalized" && doc.contentHash === hash, documentId: doc.id } : { valid: false }; } }
