export async function verifiedOriginalPdf(id:string,hash:string,getBlob:(path:string)=>Promise<Blob>):Promise<Blob>{
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(hash))throw new Error('Invalid original document reference');
 const blob=await getBlob(`/v1/operations/documents/${id}/pdf`);
 if(!blob.type.startsWith('application/pdf'))throw new Error('Original document is not a PDF');
 const bytes=await blob.arrayBuffer();const prefix=new TextDecoder().decode(bytes.slice(0,5));if(prefix!=='%PDF-')throw new Error('Invalid PDF artifact');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==hash.toLowerCase())throw new Error('Original document integrity check failed');
 return blob;
}
export interface OriginalDocumentSource {type:string;id?:string;documentId?:string;documentNumber?:string;}
export interface OriginalDocumentReference {id:string;hash:string;number:string;deliveryAvailable?:boolean;}
export async function originalDocumentReference(source:OriginalDocumentSource,get:(path:string)=>Promise<any>):Promise<OriginalDocumentReference> {
 const contract=source.type==='contract';const id=contract?source.id:source.documentId;
 if(!id)throw new Error('ยังไม่มีเอกสารที่ออกและบันทึกไว้สำหรับรายการนี้ / No issued document is available for this record.');
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('เอกสารต้นฉบับไม่ถูกต้อง / Invalid original document reference');
 const row=await get(contract?`/v1/operations/contracts/${id}/original`:`/v1/operations/documents/${id}`);
 if(row.previewUnavailableReason)throw new Error(row.previewUnavailableReason+' / Verified original unavailable. Preview, printing and download are unavailable.');
 const reference={id:contract?row.documentId:row.id,hash:row.contentHash,number:row.documentNumber,...(contract?{deliveryAvailable:row.deliveryAvailable===true}:{})};
 if(typeof reference.number!=='string'||!reference.number.trim())throw new Error('Stored document number unavailable');
 if(!/^[0-9a-f-]{36}$/i.test(reference.id??'')||!/^[0-9a-f]{64}$/i.test(reference.hash??''))throw new Error('ไม่มีเอกสารต้นฉบับที่ตรวจสอบแล้ว / Invalid original document reference');
 return reference;
}

export function originalSourceFromRow(type:string,row:Record<string,any>,resource:string):OriginalDocumentSource {
 const documentId=type==='contract'?row.documentId:type==='invoice'?(row.invoiceId||(resource==='documents'?row.id:undefined)):(row.receiptId||(['receipts','documents'].includes(resource)?row.id:undefined));
 return {type,id:row.id,...(documentId?{documentId}:{})};
}
