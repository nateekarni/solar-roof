import {renderStatusBadge} from '../../lib/status-badge';
import {formatAppDateTime,isIsoDateLike} from '../../lib/date-format';
import {formatAuditAction,formatAuditEntityType,formatAuditActor} from './audit-wording';

export function renderRecordValue(value:unknown,key:string,locale:'th'|'en') {
 if(typeof value==='string'&&/^data:(image\/|application\/pdf)/.test(value))return locale==='th'?'แนบไฟล์หลักฐานแล้ว — ดูไฟล์ในรายการโอนเงิน':'Evidence attached — open it in transfer history';
 if(value===null||value===undefined)return '—';
 if(key==='action')return formatAuditAction(String(value),locale).label;
 if(key==='entityType')return formatAuditEntityType(String(value),locale);
 if(key==='actor')return formatAuditActor(String(value),locale);
 return ['status','severity','paymentStatus','billingStatusView','issuanceStatus','quality'].includes(key)?renderStatusBadge(String(value),locale):isIsoDateLike(String(value))?formatAppDateTime(String(value),locale):typeof value==='object'?JSON.stringify(value,null,2):String(value);
}
