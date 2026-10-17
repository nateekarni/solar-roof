import type {DashboardSummaryResponse} from '@solar/api-contracts';
export async function loadContractSites(get:<T>(path:string)=>Promise<T>) {
 const summary=await get<DashboardSummaryResponse>('/v1/dashboard/summary');
 return summary.availableSites;
}
export function canCreateOperation(resource:string,user:{role:string;customerId?:string|null},actions:readonly string[]) {
  if (resource === 'contracts') return false;
  const financialAction=resource==='billing'?'calculate':resource==='documents'||resource==='receipts'?'issue':undefined;
  return financialAction?actions.includes(financialAction):resource!=='sites'||user.role==='owner';
}
