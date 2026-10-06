import {createHash} from 'node:crypto';
const hash=(sql:string)=>createHash('sha256').update(sql).digest('hex');
export function migrationChecksum(sql:string){return hash(sql.replaceAll('\r\n','\n'));}
export function matchesMigrationChecksum(stored:string,sql:string){
 const lf=sql.replaceAll('\r\n','\n');
 return [hash(sql),hash(lf),hash(lf.replaceAll('\n','\r\n'))].includes(stored);
}
