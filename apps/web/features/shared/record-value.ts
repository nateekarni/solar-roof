import {renderStatusBadge} from '../../lib/status-badge';
import {formatAppDateTime,isIsoDateLike} from '../../lib/date-format';
export function renderRecordValue(value:unknown,key:string,locale:'th'|'en') {
 return value===null||value===undefined?'—':['status','severity','paymentStatus'].includes(key)?renderStatusBadge(String(value),locale):isIsoDateLike(String(value))?formatAppDateTime(String(value),locale):typeof value==='object'?JSON.stringify(value,null,2):String(value);
}
