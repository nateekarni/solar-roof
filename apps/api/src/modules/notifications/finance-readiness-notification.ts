import type { FinancialReadinessStatus } from '@solar/api-contracts';
import type { ScopePrincipal } from '../../common/auth/route-policy.js';

export function financeReadinessNotification(user:ScopePrincipal,status:FinancialReadinessStatus) {
 if(!user.id||user.role!=='owner')return null;
 const missingCount=status.items.filter(item=>item.responsibility==='owner'&&!item.ready).length;
 if(!missingCount)return null;
 return {
  id:`workflow:finance-readiness:${status.fingerprint.slice(0,24)}`,
  title:'Complete finance setup',detail:`${missingCount} Owner setup items remaining`,
  destination:'/settings/company',createdAt:new Date().toISOString(),readAt:null as string|null,kind:'workflow' as const,
  metadata:{type:'finance-readiness' as const,missingCount},
 };
}
