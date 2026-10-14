import { hasPermission, type AuthorizationPrincipal } from './authorization.js';
import { routeAllowed, isOwnerCompanyMutation } from './route-policy.js';
export function permissionForRoute(method:string,rawPath:string):string|undefined {
 const path=rawPath.split('?')[0]!.replace(/\/$/,'');
 let resource:string|undefined;
 if(/^\/v1\/sites\/[^/]+\/live-telemetry$/.test(path))resource='technical.telemetry';
 else if(/^\/v1\/(?:sites|gateways|devices)\/[^/]+\/.*(?:register)/.test(path))resource='technical.registers';
 else if(/^\/v1\/(?:sites|gateways|devices)\/[^/]+\/.*(?:fields)/.test(path))resource='technical.fields';
 else if(/^\/v1\/devices\/[^/]+\/cadence/.test(path))resource='technical.devices';
 else if(/^\/v1\/sites\/[^/]+\/payload/.test(path))resource='technical.reception';
 else if(/^\/v1\/sites\/[^/]+\/(?:gateway|devices|telemetry|config|meter|billing-source)/.test(path))resource='technical.gateways';
 else if(/^\/v1\/sites\/[^/]+\/(?:billing-settings|customer-users|billing-history)/.test(path))resource='business.sites';
 else if(/^\/v1\/sites(?:\/|$)/.test(path)||/^\/v1\/operations\/sites(?:\/|$)/.test(path))resource='business.sites';
 else if(/^\/v1\/(?:operations\/)?customers(?:\/|$)/.test(path))resource='business.customers';
 else if(/^\/v1\/(?:contracts|billing-cycles|manual-bills|site-rates)(?:\/|$)/.test(path)||/^\/v1\/operations\/(?:billing|contracts|invoices)(?:\/|$)/.test(path))resource='business.billing';
 else if(/^\/v1\/operations\/receipts(?:\/|$)/.test(path))resource='business.receipts';
 else if(/^\/v1\/documents(?:\/|$)/.test(path)||/^\/v1\/operations\/documents(?:\/|$)/.test(path))resource='business.documents';
 else if(/^\/v1\/tariff-catalog(?:\/|$)/.test(path))resource='business.tariffs';
 else if(/^\/v1\/(?:gateways|devices)(?:\/|$)/.test(path))resource=`technical.${path.split('/')[2]}`;
 else if(/^\/v1\/mqtt-brokers(?:\/|$)/.test(path))resource='technical.brokers';
 else if(/^\/v1\/(?:meter-presets|payload-presets)(?:\/|$)/.test(path))resource='technical.profiles';
 else if(/^\/v1\/(?:alerts|alert-rules|operations\/alerts)(?:\/|$)/.test(path))resource='technical.alerts';
 else if(/^\/v1\/telemetry(?:\/|$)/.test(path))resource='technical.telemetry';
 else if(/^\/v1\/settings\/(?:company|bank-accounts|business)(?:\/|$)/.test(path))resource='business.settings';
 else if(/^\/v1\/settings\/technical(?:\/|$)/.test(path))resource='technical.settings';
 else if(/^\/v1\/dashboard\/(?:financial|revenue)(?:\/|$)/.test(path))resource='business.billing';
 if(!resource)return undefined;
 const action=/(?:download|export)(?:\/|$)/.test(path)?'download':/(?:approve|approve-issuance|verify-payment)(?:\/|$)/.test(path)?'approve':['GET','HEAD'].includes(method)?'view':'edit';
 return `${resource}.${action}`;
}
export function authorizedRoute(user:AuthorizationPrincipal|undefined,method:string,path:string):boolean {
 if(!user?.role)return false;
 if(/^\/v1\/settings\/finance-readiness(?:\/|$)/.test(path))return routeAllowed(user.role,method,path);
 if(isOwnerCompanyMutation(method,path))return user.role==='owner';
 if(/^\/v1\/operations\/contracts\/[^/]+\/original$/.test(path)&&method==='POST')return ['owner','accountant'].includes(user.role)&&hasPermission(user,'business.billing.edit');
 if(/^\/v1\/contracts\/[^/]+\/send-email$/.test(path)&&method==='POST')return ['owner','accountant'].includes(user.role)&&hasPermission(user,'business.billing.edit');
 if(/^\/v1\/contracts(?:\/|$)/.test(path)&&!['GET','HEAD'].includes(method))return false;
 if(/^\/v1\/(?:reports|jobs|history)(?:\/|$)/.test(path)||/^\/v1\/operations\/(?:reports|notifications)(?:\/|$)/.test(path))return false;
 if(/^\/v1\/team(?:\/|$)/.test(path))return user.role==='owner'||user.role==='admin';
 if(/^\/v1\/dashboard(?:\/|$)/.test(path)&&!/^\/v1\/dashboard\/(?:financial|revenue)(?:\/|$)/.test(path)){
  if(!['GET','HEAD'].includes(method))return false;
  if(user.role==='customer_user')return routeAllowed(user.role,method,path);
  return hasPermission(user,'business.dashboard.view')||hasPermission(user,'technical.dashboard.view');
 }
 if(path==='/v1/settings')return false; // Combined settings never expose both domains.
 const permission=permissionForRoute(method,path);
 if(permission){
  if(user.role==='customer_user')return routeAllowed(user.role,method,path);
  return hasPermission(user,permission);
 }
 return routeAllowed(user.role,method,path);
}
