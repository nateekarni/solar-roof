export async function verifiedOriginalPdf(id:string,hash:string,getBlob:(path:string)=>Promise<Blob>):Promise<Blob>{
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(hash))throw new Error('Invalid original document reference');
 const blob=await getBlob(`/v1/operations/documents/${id}/pdf`);
 if(!blob.type.startsWith('application/pdf'))throw new Error('Original document is not a PDF');
 const bytes=await blob.arrayBuffer();const prefix=new TextDecoder().decode(bytes.slice(0,5));if(prefix!=='%PDF-')throw new Error('Invalid PDF artifact');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==hash.toLowerCase())throw new Error('Original document integrity check failed');
 return blob;
}
