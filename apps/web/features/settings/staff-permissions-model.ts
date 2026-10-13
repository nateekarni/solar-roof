export type RuleValue=boolean|null;
export function filterEmployees<T extends {displayName:string;email:string;status:string;grant:{positionId:string|null}|null}>(employees:T[],search:string,status:string,position:string):T[]{const term=search.trim().toLocaleLowerCase();return employees.filter(employee=>(!term||`${employee.displayName} ${employee.email}`.toLocaleLowerCase().includes(term))&&(status==='all'||employee.status===status)&&(position==='all'||(position==='unassigned'?!employee.grant?.positionId:employee.grant?.positionId===position)));}
export function effectiveRule(permission:string,rules:Record<string,RuleValue>,overrides:Record<string,RuleValue>){return overrides[permission]??rules[permission]??false;}
export function domainOverrides(domain:string,rules:Record<string,RuleValue>){return Object.fromEntries(Object.entries(rules).filter(([permission])=>permission.startsWith(domain+'.')));}

export function filterPositions<T extends {id:string;name:string}>(positions:T[],employees:{grant:{positionId:string|null}|null}[],search:string,usage:string):T[]{const assigned=new Set(employees.flatMap(employee=>employee.grant?.positionId?[employee.grant.positionId]:[]));const term=search.trim().toLocaleLowerCase();return positions.filter(position=>position.name.toLocaleLowerCase().includes(term)&&(usage==='all'||(usage==='assigned'?assigned.has(position.id):!assigned.has(position.id))));}

type StaffDraft={positionId:string;overrides:Record<string,RuleValue>;scope:{mode:'all'|'selected';siteIds:string[]}};
export function staffDraftChanged(initial:StaffDraft,current:StaffDraft):boolean{
 const normalize=(draft:StaffDraft)=>JSON.stringify({positionId:draft.positionId,overrides:Object.entries(draft.overrides).filter(([,value])=>value!==null).sort(([a],[b])=>a.localeCompare(b)),scope:{mode:draft.scope.mode,siteIds:[...draft.scope.siteIds].sort()}});
 return normalize(initial)!==normalize(current);
}

export function canDismissStaffDialog(busy:boolean,dirty:boolean,confirmDiscard:()=>boolean):boolean{return !busy&&(!dirty||confirmDiscard());}

export function staffStatusLabel(status:string,locale:string):string{const labels:Record<string,readonly [string,string]>={active:['ใช้งาน','Active'],inactive:['ปิดใช้งาน','Inactive'],pending:['รอยืนยัน','Pending'],invited:['เชิญแล้ว','Invited']};return labels[status]?.[locale==='th'?0:1]??status;}
