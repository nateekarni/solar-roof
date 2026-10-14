import {createHash} from 'node:crypto';
const format=(hex:string)=>hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
/** Keep pre-fix lookup stable; encode new deterministic IDs with RFC UUID bits. */
export function manualBillIds(siteId:string,idempotencyKey:string):{id:string;legacyId:string}{
 const bytes=createHash('sha256').update(`manual-invoice:${siteId}:${idempotencyKey}`).digest().subarray(0,16);
 const legacyId=format(bytes.toString('hex'));
 bytes[6]=(bytes[6]!&0x0f)|0x40;
 bytes[8]=(bytes[8]!&0x3f)|0x80;
 return {id:format(bytes.toString('hex')),legacyId};
}
