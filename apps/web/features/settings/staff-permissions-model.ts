export type RuleValue=boolean|null;
export type PositionChoice={kind:'existing';id:string;name:string}|{kind:'new';name:string};
export function positionOptions(query:string,positions:readonly {id:string;name:string}[]):PositionChoice[]{
 const name=query.trim().normalize('NFC'),term=name.toLocaleLowerCase();
 const matches=positions.filter(position=>position.name.trim().normalize('NFC').toLocaleLowerCase().includes(term));
 if(matches.length)return matches.map(position=>({kind:'existing',id:position.id,name:position.name}));
 return name&&name.length<=120?[{kind:'new',name}]:[];
}
export function employeePositionLabel(employee:{companyPosition?:string|null;grant:{positionId:string|null}|null},positions:readonly {id:string;name:string}[]):string{
 return employee.companyPosition||positions.find(position=>position.id===employee.grant?.positionId)?.name||'—';
}
export function employeePositionDraft({revision,choice,domain,permissions,rules,overrides,scope,permissionsConfigured=false,builtInManager=false}:{revision:number;choice:PositionChoice|null;domain:string;permissions:string[];rules:Record<string,RuleValue>;overrides:Record<string,RuleValue>;scope:{mode:'all'|'selected';siteIds:string[]};permissionsConfigured?:boolean;builtInManager?:boolean}){
 if(!choice)throw new Error('Position required');
 if(choice.kind==='new'&&(!choice.name.trim()||choice.name.trim().length>120))throw new Error('Position name required');
 if(choice.kind==='new'&&!permissionsConfigured&&!builtInManager)throw new Error('Configure position permissions');
 const domainRules=Object.fromEntries(permissions.filter(permission=>permission.startsWith(domain+'.')).map(permission=>[permission,effectiveRule(permission,rules,overrides)]));
 return {revision,position:choice.kind==='existing'?{id:choice.id}:{name:choice.name.trim(),rules:builtInManager?{}:domainRules},overrides:builtInManager?{}:domainOverrides(domain,overrides),scope:builtInManager?{mode:'all' as const,siteIds:[]}:{...scope,siteIds:scope.mode==='all'?[]:scope.siteIds}};
}
export function filterEmployees<T extends {displayName:string;email:string;status:string;companyPositionId?:string|null;grant:{positionId:string|null}|null}>(employees:T[],search:string,status:string,position:string):T[]{const term=search.trim().toLocaleLowerCase();return employees.filter(employee=>(!term||`${employee.displayName} ${employee.email}`.toLocaleLowerCase().includes(term))&&(position==='all'||(position==='unassigned'?!employee.companyPositionId&&!employee.grant?.positionId:employee.companyPositionId===position||employee.grant?.positionId===position))&&(status==='all'||employee.status===status));}
export function effectiveRule(permission:string,rules:Record<string,RuleValue>,overrides:Record<string,RuleValue>){return overrides[permission]??rules[permission]??false;}
export function domainOverrides(domain:string,rules:Record<string,RuleValue>){return Object.fromEntries(Object.entries(rules).filter(([permission])=>permission.startsWith(domain+'.')));}

export function filterPositions<T extends {id:string;name:string}>(positions:T[],employees:{companyPositionId?:string|null;grant:{positionId:string|null}|null}[],search:string,usage:string):T[]{const assigned=new Set(employees.flatMap(employee=>[employee.companyPositionId,employee.grant?.positionId].filter((id):id is string=>!!id)));const term=search.trim().toLocaleLowerCase();return positions.filter(position=>position.name.toLocaleLowerCase().includes(term)&&(usage==='all'||(usage==='assigned'?assigned.has(position.id):!assigned.has(position.id))));}

type StaffDraft={positionId:string;overrides:Record<string,RuleValue>;scope:{mode:'all'|'selected';siteIds:string[]}};
export function staffDraftChanged(initial:StaffDraft,current:StaffDraft):boolean{
 const normalize=(draft:StaffDraft)=>JSON.stringify({positionId:draft.positionId,overrides:Object.entries(draft.overrides).filter(([,value])=>value!==null).sort(([a],[b])=>a.localeCompare(b)),scope:{mode:draft.scope.mode,siteIds:[...draft.scope.siteIds].sort()}});
 return normalize(initial)!==normalize(current);
}

export function canDismissStaffDialog(busy:boolean,dirty:boolean,confirmDiscard:()=>boolean):boolean{return !busy&&(!dirty||confirmDiscard());}

export function staffStatusLabel(status:string,locale:string):string{const labels:Record<string,readonly [string,string]>={active:['ใช้งาน','Active'],inactive:['ปิดใช้งาน','Inactive'],pending:['รอยืนยัน','Pending'],invited:['เชิญแล้ว','Invited']};return labels[status]?.[locale==='th'?0:1]??status;}
