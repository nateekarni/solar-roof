export type RuleValue=boolean|null;
export type PositionChoice={kind:'existing';id:string;name:string}|{kind:'new';name:string};
export function positionOptions(query:string,positions:readonly {id:string;name:string}[]):PositionChoice[]{
 const name=query.trim().normalize('NFC'),term=name.toLocaleLowerCase();
 const matches=positions.filter(position=>position.name.trim().normalize('NFC').toLocaleLowerCase().includes(term));
 const choices:PositionChoice[]=matches.map(position=>({kind:'existing',id:position.id,name:position.name}));
 if(name&&name.length<=120&&!positions.some(position=>position.name.trim().normalize('NFC').toLocaleLowerCase()===term))choices.push({kind:'new',name});
 return choices;
}
export function employeePositionLabel(employee:{companyPosition?:string|null;grant:{positionId:string|null}|null},positions:readonly {id:string;name:string}[]):string{
 return employee.companyPosition||positions.find(position=>position.id===employee.grant?.positionId)?.name||'—';
}
export const ACTIVE_DISPLAY_RESOURCES: Record<'business' | 'technical', readonly string[]> = {
  business: ['dashboard', 'sites', 'billing', 'receipts', 'tariffs', 'settings', 'audit'],
  technical: ['dashboard', 'gateways', 'alerts', 'settings', 'profiles', 'audit'],
};

export const RESOURCE_LABELS: Record<string, Record<'business' | 'technical', readonly [string, string]>> = {
  dashboard: {
    business: ['ภาพรวม', 'Dashboard'],
    technical: ['ภาพรวม', 'Dashboard'],
  },
  sites: {
    business: ['จัดการไซต์งาน', 'Sites'],
    technical: ['จัดการไซต์งาน', 'Sites'],
  },
  billing: {
    business: ['ใบวางบิล', 'Billing'],
    technical: ['ใบวางบิล', 'Billing'],
  },
  receipts: {
    business: ['ใบเสร็จรับเงิน', 'Receipts'],
    technical: ['ใบเสร็จรับเงิน', 'Receipts'],
  },
  tariffs: {
    business: ['อัตราค่าไฟ', 'Tariffs'],
    technical: ['อัตราค่าไฟ', 'Tariffs'],
  },
  settings: {
    business: ['ตั้งค่าบริษัทและบัญชี', 'Company and accounts'],
    technical: ['การรับข้อมูล', 'Data reception'],
  },
  audit: {
    business: ['ประวัติการทำงาน', 'Audit'],
    technical: ['ประวัติการทำงาน', 'Audit'],
  },
  gateways: {
    business: ['จัดการเกตเวย์', 'Gateways'],
    technical: ['จัดการเกตเวย์', 'Gateways'],
  },
  alerts: {
    business: ['การแจ้งเตือนระบบ', 'Alerts'],
    technical: ['การแจ้งเตือนระบบ', 'Alerts'],
  },
  profiles: {
    business: ['แม่แบบอุปกรณ์', 'Device templates'],
    technical: ['แม่แบบอุปกรณ์', 'Device templates'],
  },
};

export function resourceLabel(group: string, domain: 'business' | 'technical' = 'business', locale: string = 'th'): string {
  const isTh = locale === 'th';
  const entry = RESOURCE_LABELS[group]?.[domain];
  if (entry) return entry[isTh ? 0 : 1];
  return group;
}

export function bundleSubPermissions(
  domain: string,
  rules: Record<string, RuleValue>,
  permissions?: readonly string[]
): Record<string, RuleValue> {
  const next: Record<string, RuleValue> = { ...rules };
  const allowed = (key: string) => !permissions || permissions.includes(key);
  if (domain === 'business') {
    for (const act of ['view', 'edit'] as const) {
      const target = `business.customers.${act}`;
      if (allowed(target)) {
        const val = next[`business.sites.${act}`];
        if (val !== undefined) {
          next[target] = val;
        }
      }
    }
    for (const act of ['view', 'edit', 'download'] as const) {
      const target = `business.documents.${act}`;
      if (allowed(target)) {
        const val = next[`business.billing.${act}`];
        if (val !== undefined) {
          next[target] = val;
        }
      }
    }
  } else if (domain === 'technical') {
    for (const sub of ['devices', 'fields', 'registers', 'brokers'] as const) {
      for (const act of ['view', 'edit'] as const) {
        const target = `technical.${sub}.${act}`;
        if (allowed(target)) {
          const val = next[`technical.gateways.${act}`];
          if (val !== undefined) {
            next[target] = val;
          }
        }
      }
    }
    const gwView = next['technical.gateways.view'];
    if (gwView !== undefined) {
      if (allowed('technical.telemetry.view')) next['technical.telemetry.view'] = gwView;
      if (allowed('technical.telemetry.download')) next['technical.telemetry.download'] = gwView;
    }
    for (const act of ['view', 'edit'] as const) {
      const target = `technical.reception.${act}`;
      if (allowed(target)) {
        const val = next[`technical.settings.${act}`];
        if (val !== undefined) {
          next[target] = val;
        }
      }
    }
  }
  return next;
}

export interface EmployeePositionDraftResult {
 revision: number;
 position?: { id?: string; name?: string; rules?: Record<string, RuleValue> };
 companyPosition?: string;
 overrides: Record<string, RuleValue>;
 scope: { mode: 'all' | 'selected'; siteIds: string[] };
 displayName?: string;
}

export function employeePositionDraft({revision,choice,domain,permissions,rules,overrides,scope,builtInManager=false,displayName,companyPosition}:{revision:number;choice:PositionChoice|null;domain:string;permissions:string[];rules:Record<string,RuleValue>;overrides:Record<string,RuleValue>;scope:{mode:'all'|'selected';siteIds:string[]};permissionsConfigured?:boolean;builtInManager?:boolean;displayName?:string|undefined;companyPosition?:string|undefined}):EmployeePositionDraftResult{
 if(!choice&&!companyPosition)throw new Error('Position required');
 if(choice?.kind==='new'&&(!choice.name.trim()||choice.name.trim().length>120))throw new Error('Position name required');
 const bundledOverrides=bundleSubPermissions(domain,overrides,permissions);
 const domainRules=Object.fromEntries(permissions.filter(permission=>permission.startsWith(domain+'.')).map(permission=>[permission,effectiveRule(permission,rules,bundledOverrides)]));
 return {
  revision,
  ...(choice?.kind==='existing'
    ? {position:{id:choice.id}}
    : choice?.kind==='new'
      ? {position:{name:choice.name.trim(),rules:builtInManager?{}:domainRules}}
      : companyPosition
        ? {companyPosition:companyPosition.trim()}
        : {}),
  overrides:builtInManager?{}:domainOverrides(domain,bundledOverrides),
  scope:builtInManager?{mode:'all' as const,siteIds:[]}:{...scope,siteIds:scope.mode==='all'?[]:scope.siteIds},
  ...(displayName!==undefined?{displayName:displayName.trim()}:{})
 };
}
export function isArchivedInvitationStatus(status: string): boolean {
  return status === 'cancelled' || status === 'expired';
}

export function sortEmployeesWithArchivedLast<T extends { status: string }>(employees: readonly T[]): T[] {
  const normalRows: T[] = [];
  const archivedRows: T[] = [];
  for (const emp of employees) {
    if (isArchivedInvitationStatus(emp.status)) {
      archivedRows.push(emp);
    } else {
      normalRows.push(emp);
    }
  }
  return [...normalRows, ...archivedRows];
}

export function maskPersonalEmail(email?: string | null): string {
  const trimmed = (email ?? '').trim();
  if (!trimmed) return '—';
  const atIndex = trimmed.indexOf('@');
  if (atIndex === -1) {
    return trimmed.length <= 2 ? `${trimmed[0] ?? '*'}***` : `${trimmed.slice(0, 2)}***`;
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const prefix = local.length <= 2 ? (local[0] ?? '*') : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

export function maskPersonalPhone(phone?: string | null): string {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return '—';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 9) {
    return `${digits.slice(0, 2)}x-xxx-${digits.slice(-4)}`;
  }
  if (digits.length >= 5) {
    return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
  }
  return `${trimmed.slice(0, 2)}***`;
}

export function filterEmployees<T extends {displayName:string;email:string;status:string;companyPositionId?:string|null;grant:{positionId:string|null}|null}>(employees:T[],search:string,status:string,position:string):T[]{const term=search.trim().toLocaleLowerCase();const matched=employees.filter(employee=>(!term||`${employee.displayName} ${employee.email}`.toLocaleLowerCase().includes(term))&&(position==='all'||(position==='unassigned'?!employee.companyPositionId&&!employee.grant?.positionId:employee.companyPositionId===position||employee.grant?.positionId===position))&&(status==='all'||employee.status===status));return sortEmployeesWithArchivedLast(matched);}
export function effectiveRule(permission:string,rules:Record<string,RuleValue>,overrides:Record<string,RuleValue>){return overrides[permission]??rules[permission]??false;}
export function domainOverrides(domain:string,rules:Record<string,RuleValue>){return Object.fromEntries(Object.entries(rules).filter(([permission])=>permission.startsWith(domain+'.')));}

export function filterPositions<T extends {id:string;name:string}>(positions:T[],employees:{companyPositionId?:string|null;grant:{positionId:string|null}|null}[],search:string,usage:string):T[]{const assigned=new Set(employees.flatMap(employee=>[employee.companyPositionId,employee.grant?.positionId].filter((id):id is string=>!!id)));const term=search.trim().toLocaleLowerCase();return positions.filter(position=>position.name.toLocaleLowerCase().includes(term)&&(usage==='all'||(usage==='assigned'?assigned.has(position.id):!assigned.has(position.id))));}

type StaffDraft={positionId:string;overrides:Record<string,RuleValue>;scope:{mode:'all'|'selected';siteIds:string[]}};
export function staffDraftChanged(initial:StaffDraft,current:StaffDraft):boolean{
 const normalize=(draft:StaffDraft)=>JSON.stringify({positionId:draft.positionId,overrides:Object.entries(draft.overrides).filter(([,value])=>value!==null).sort(([a],[b])=>a.localeCompare(b)),scope:{mode:draft.scope.mode,siteIds:[...draft.scope.siteIds].sort()}});
 return normalize(initial)!==normalize(current);
}

export function positionRulesChanged(initial:Record<string,RuleValue>,current:Record<string,RuleValue>):boolean{
 const allKeys=new Set([...Object.keys(initial),...Object.keys(current)]);
 for(const key of allKeys){
  if((initial[key]===true)!==(current[key]===true))return true;
 }
 return false;
}

export function canDismissStaffDialog(busy:boolean,dirty:boolean,confirmDiscard:()=>boolean):boolean{return !busy&&(!dirty||confirmDiscard());}

export function staffStatusLabel(status:string,locale:string):string{
 const labels:Record<string,readonly [string,string]>={
  active:['ใช้งาน','Active'],
  inactive:['ยกเลิกแล้ว','Inactive'],
  pending:['รอยืนยัน','Pending'],
  invited:['เชิญแล้ว','Invited'],
  cancelled:['ยกเลิกแล้ว','Cancelled'],
  expired:['คำเชิญหมดอายุ','Expired'],
 };
 return labels[status]?.[locale==='th'?0:1]??status;
}

export const RESOURCE_VALID_ACTIONS: Record<string, readonly ('view' | 'edit' | 'approve' | 'download')[]> = {
  // Business domain
  dashboard: ['view'],
  sites: ['view', 'edit'],
  customers: ['view', 'edit'],
  billing: ['view', 'edit', 'approve', 'download'],
  receipts: ['view', 'edit', 'approve', 'download'],
  documents: ['view', 'edit', 'download'],
  tariffs: ['view', 'edit'],
  settings: ['view', 'edit'],
  audit: ['view', 'download'],

  // Technical domain
  gateways: ['view', 'edit'],
  devices: ['view', 'edit'],
  fields: ['view', 'edit'],
  profiles: ['view', 'edit'],
  registers: ['view', 'edit'],
  reception: ['view', 'edit'],
  brokers: ['view', 'edit'],
  alerts: ['view', 'edit'],
  telemetry: ['view', 'download'],
};

export function isActionValidForResource(resource: string, action: string): boolean {
  const actions = RESOURCE_VALID_ACTIONS[resource];
  return actions ? actions.includes(action as ('view' | 'edit' | 'approve' | 'download')) : false;
}

export const ROLE_POSITION_PRESETS: Record<string, readonly { th: string; en: string }[]> = {
  accountant: [
    { th: 'เจ้าหน้าที่บัญชีและการเงิน', en: 'Accounting & Finance Officer' },
    { th: 'ผู้ตรวจสอบบัญชี', en: 'Internal Auditor' },
    { th: 'ผู้จัดการฝ่ายบัญชี', en: 'Accounting Manager' },
  ],
  operator: [
    { th: 'วิศวกรควบคุมระบบ', en: 'Operations Engineer' },
    { th: 'เจ้าหน้าที่เทคนิค', en: 'Technical Specialist' },
    { th: 'วิศวกรบำรุงรักษา', en: 'Maintenance Engineer' },
  ],
  owner: [
    { th: 'กรรมการผู้จัดการ', en: 'Managing Director' },
    { th: 'ประธานเจ้าหน้าที่บริหาร', en: 'Chief Executive Officer' },
  ],
  admin: [
    { th: 'ผู้ดูแลระบบอาวุโส', en: 'Senior System Administrator' },
    { th: 'ผู้ดูแลระบบสารสนเทศ', en: 'IT Administrator' },
  ],
};

export function applyPositionPreset(
  domain: string,
  permissions: readonly string[],
  presetRules: Record<string, RuleValue> = {}
): Record<string, boolean> {
  const safeRules = presetRules ?? {};
  const result: Record<string, boolean> = {};
  for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
    result[p] = safeRules[p] === true;
  }
  return result;
}

export function buildInvitePayload({
  email,
  name,
  position,
  domain,
  permissions,
  overrides,
  scope,
}: {
  email: string;
  name: string;
  position: string;
  domain: string;
  permissions: readonly string[];
  overrides: Record<string, RuleValue>;
  scope: { mode: 'all' | 'selected'; siteIds: string[] };
}) {
  const bundled = bundleSubPermissions(domain, overrides);
  const snapshotOverrides: Record<string, boolean> = {};
  for (const p of permissions.filter((perm) => perm.startsWith(domain + '.'))) {
    snapshotOverrides[p] = bundled[p] === true;
  }
  return {
    email: email.trim().toLowerCase(),
    displayName: name.trim(),
    role: 'operator' as const,
    companyPosition: position.trim() || undefined,
    permissions: snapshotOverrides,
    scope: {
      mode: scope.mode,
      siteIds: scope.mode === 'all' ? [] : scope.siteIds,
    },
  };
}

