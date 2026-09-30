import { Inject, Injectable } from "@nestjs/common";
import { DocumentService } from "./document.service.js";
@Injectable()
export class VerificationService {
  constructor(@Inject(DocumentService) private readonly documents:DocumentService) {}
  async verify(publicId:string,hash:string):Promise<{valid:boolean;documentId?:string}> {
    try { const doc=await this.documents.get(publicId); return {valid:doc.status==='finalized'&&doc.contentHash===hash,documentId:doc.id}; }
    catch { return {valid:false}; }
  }
}
