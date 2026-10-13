import { BadRequestException } from '@nestjs/common';

export type PermissionDomain = 'business' | 'technical';
export type SiteAccessScope = { mode:'all'|'selected'; siteIds:string[] };
export interface Authorization { revision:number; permissions:string[]; scopes:Record<PermissionDomain,SiteAccessScope> }
export interface AuthorizationPrincipal { role?:string|undefined; customerId?:string|null|undefined; authorization?:Authorization|undefined; assignedSiteIds?:readonly string[]|undefined }
export const PERMISSION_RESOURCES:Record<PermissionDomain,readonly string[]> = {
 business:['dashboard','sites','customers','billing','receipts','documents','tariffs','settings','audit'],
 technical:['dashboard','gateways','devices','fields','profiles','registers','reception','brokers','alerts','settings','telemetry','audit'],
};
export const PERMISSION_ACTIONS = ['view','edit','approve','download'] as const;
export const PERMISSION_CATALOG = Object.entries(PERMISSION_RESOURCES).flatMap(([domain,resources])=>resources.flatMap(resource=>PERMISSION_ACTIONS.map(action=>`${domain}.${resource}.${action}`)));
export function validateDomainRules(domain:PermissionDomain,value:unknown):Record<string,boolean|null> {
 if(!value||typeof value!=='object'||Array.isArray(value)) throw new BadRequestException('Invalid permission rules');
 for(const [key,grant] of Object.entries(value)) if(!key.startsWith(`${domain}.`)||!PERMISSION_CATALOG.includes(key)||!(grant===true||grant===false||grant===null))throw new BadRequestException('Invalid or cross-domain permission');
 return value as Record<string,boolean|null>;
}
export function validateScope(value:unknown):SiteAccessScope {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Invalid scope');
 const scope=value as SiteAccessScope;
 if(Object.keys(value).some(k=>!['mode','siteIds'].includes(k))||!['all','selected'].includes(scope.mode)||!Array.isArray(scope.siteIds)||scope.siteIds.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))||new Set(scope.siteIds).size!==scope.siteIds.length||scope.mode==='all'&&scope.siteIds.length>0)throw new BadRequestException('Invalid scope');
 return scope;
}
export interface DomainGrant {domain:PermissionDomain; preset:Record<string,boolean|null>; overrides:Record<string,boolean|null>; scope:SiteAccessScope}
export function effectiveAuthorization(role:string,revision:number,grants:DomainGrant[]):Authorization {
 const scopes:Authorization['scopes']={business:{mode:'selected',siteIds:[]},technical:{mode:'selected',siteIds:[]}};
 const permissions=new Set<string>();
 const manager=role==='owner'?'business':role==='admin'?'technical':undefined;
 if(manager){scopes[manager]={mode:'all',siteIds:[]};for(const key of PERMISSION_CATALOG)if(key.startsWith(`${manager}.`))permissions.add(key);}
 if(role!=='customer_user')for(const grant of grants){
  scopes[grant.domain]=grant.scope;
  for(const key of PERMISSION_CATALOG.filter(key=>key.startsWith(`${grant.domain}.`))){const override=grant.overrides[key];if(override===true||override==null&&grant.preset[key]===true)permissions.add(key);else if(override===false)permissions.delete(key);}
 }
 return {revision,permissions:[...permissions].sort(),scopes};
}
export function hasPermission(user:AuthorizationPrincipal|undefined,permission:string):boolean {
 if(!user||!PERMISSION_CATALOG.includes(permission))return false;
 // Platform managers do not acquire authority through staff presets.
 if(user.role==='owner')return permission.startsWith('business.');
 if(user.role==='admin')return permission.startsWith('technical.');
 return user.authorization?.permissions.includes(permission)??false;
}
/** null means all sites. Empty array means no sites. Apply in SQL before totals/pagination. */
export function siteScope(user:AuthorizationPrincipal|undefined,domain:PermissionDomain):string[]|null {
 if(!user)return [];
 if(user.role==='customer_user')return domain==='business'&&user.assignedSiteIds?.length===1?[...user.assignedSiteIds]:[];
 if(user.role==='owner')return domain==='business'?null:[];
 if(user.role==='admin')return domain==='technical'?null:[];
 const scope=user.authorization?.scopes[domain];
 return scope?.mode==='all'?null:scope?.siteIds??[];
}
