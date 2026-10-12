export interface AuthorizationSnapshot{revision:number;permissions:string[];scopes:{business:{mode:'all'|'selected';siteIds:string[]};technical:{mode:'all'|'selected';siteIds:string[]}}}
import {canVisitPage} from '@solar/domain';
export function effectivePageAccess(user:{role:string;authorization?:AuthorizationSnapshot},rawPath:string){
 const path=rawPath.split(/[?#]/)[0]!.replace(/\/+$/,'')||'/';
 if(path==='/settings/system')return user.role==='admin'||!['owner','customer_user'].includes(user.role)&&!!user.authorization?.permissions.includes('technical.settings.view');
 if(!user.authorization||user.role==='customer_user')return canVisitPage(user.role,path);
 if(['/','/settings','/settings/account','/settings/general','/settings/security'].includes(path))return true;
 if(path==='/settings/users')return user.role==='owner'||user.role==='admin';
 const resource=path.startsWith('/records/')?path.split('/')[2]:path.split('/')[1];
 const routePermissions:Record<string,string[]>={sites:['business.sites.view'],customers:['business.customers.view'],billing:['business.billing.view'],contracts:['business.documents.view'],documents:['business.documents.view'],receipts:['business.receipts.view'],gateways:['technical.gateways.view'],alerts:['technical.alerts.view'],notifications:['technical.alerts.view']};
 let permissions=routePermissions[resource??''];
 if(path.startsWith('/settings/'))permissions=path==='/settings/company'?['business.settings.view']:path==='/settings/rates'?['business.tariffs.view']:path==='/settings/meter-presets'?['technical.profiles.view','technical.fields.view']:path==='/settings/audit'?['business.audit.view','technical.audit.view']:path==='/settings/system'?['technical.settings.view']:[];
 return !!permissions?.some(permission=>user.authorization!.permissions.includes(permission));
}
