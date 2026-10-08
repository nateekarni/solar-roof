/** All callers must use their issuance transaction; rollback releases an unissued allocation. */
export interface DocumentNumberClient {
 query(sql:string,params?:unknown[]):Promise<{rows:any[]}>;
}
export type HumanDocumentType='invoice'|'receipt'|'contract';
const families:Record<HumanDocumentType,string>={invoice:'INV',receipt:'RCP',contract:'PPA'};
export function documentNumberPrefix(type:HumanDocumentType,issueDate:string|Date):string {
 const family=families[type];
 if(!Object.hasOwn(families,type))throw new Error(`Unsupported human document family: ${type}`);
 const day=issueDate instanceof Date?new Date(issueDate.getTime()+7*3600000).toISOString().slice(0,10):issueDate;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new Error('Valid Bangkok issue date required');
 return `${family}${day.slice(2,4)}${day.slice(5,7)}`;
}
export async function allocateDocumentNumber(client:DocumentNumberClient,type:HumanDocumentType):Promise<{number:string;issueDate:string}> {
 const issueDate=(await client.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS day")).rows[0]?.day;
 const prefix=documentNumberPrefix(type,issueDate);
 const result=await client.query(`INSERT INTO document_number_series(prefix,last_value) VALUES($1,1)
 ON CONFLICT(prefix) DO UPDATE SET last_value=document_number_series.last_value+1
 WHERE document_number_series.last_value < 99999 RETURNING last_value`,[prefix]);
 const value=Number(result.rows[0]?.last_value);
 if(!Number.isInteger(value)||value<1||value>99999)throw new Error(`Document number series exhausted: ${prefix}`);
 return {number:prefix+String(value).padStart(5,'0'),issueDate};
}
/** A safe filesystem basename also suitable for quoted ASCII Content-Disposition. */
export function documentPdfFilename(number:string):string {
 const base=number.replace(/[^A-Za-z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,160);
 if(!base)throw new Error('Document number required for PDF filename');
 return `${base}.pdf`;
}
