import { isBusinessRole } from "@solar/domain";
import type { Authorization } from './authorization.js';
export interface ScopePrincipal {
  id?: string;
  role?: string;
  customerId?: string | undefined;
  assignedSiteIds?: readonly string[];
  authorization?:Authorization;
}

export function customerScope(user: ScopePrincipal | undefined): string[] | null {
  if (!user || !["owner", "admin", "operator", "accountant", "customer_user"].includes(user.role ?? "")) return [];
  if (user.role === "owner" || user.role === "admin") return null;
  if (user.role === 'customer_user' && user.assignedSiteIds?.length !== 1) return [];
  if (user.customerId) return [user.customerId];
  return user.role === "customer_user" ? [] : null;
}

/** Action policy is server-owned; request headers cannot select privileges. */
export function isOwnerCompanyMutation(method: string, rawPath: string): boolean {
  const path = rawPath.split('?')[0]!.replace(/\/$/, '');
  return /^\/v1\/settings\/(?:company|bank-accounts)(?:\/|$)/i.test(path) && !['GET','HEAD','OPTIONS'].includes(method.toUpperCase());
}

export function routeAllowed(role: string, method: string, rawPath: string): boolean {
  if (!["owner", "admin", "operator", "accountant", "customer_user"].includes(role)) return false;
  const path = rawPath.split("?")[0]!.replace(/\/$/, "");
  if (isOwnerCompanyMutation(method,path)) return role === 'owner';
  if(/^\/v1\/contracts(?:\/|$)/.test(path)&&!['GET','HEAD'].includes(method))return false;
  if(role==='owner'&&/^\/v1\/operations\/sites(?:\/|$)/.test(path))return ['GET','HEAD'].includes(method);
  if(/^\/v1\/sites\/[^/]+\/billing-settings$/.test(path))return ['owner','accountant'].includes(role)&&['GET','HEAD','PUT'].includes(method);
  if(/^\/v1\/(?:tariff-catalog|site-rates|manual-bills)(?:\/|$)/.test(path))return ['owner','accountant'].includes(role)&&['GET','HEAD','POST'].includes(method);
  if(/^\/v1\/billing-cycles\/[^/]+\/rate$/.test(path))return role==='owner'&&method==='PATCH';
  if(/^\/v1\/alert-rules(?:\/|$)/.test(path))return ['admin','operator'].includes(role)&&['GET','HEAD','POST','DELETE'].includes(method);
  if (role === 'admin' && /^\/v1\/(?:contracts|billing-cycles|documents|operations\/(?:contracts|billing|invoices|receipts|documents)|dashboard\/revenue|settings\/(?:company|bank-accounts))(?:\/|$)/.test(path)) return false;
  if (path === "/v1/sites/identity-draft") return role === "admin" && method === "POST";
  if (role === 'owner' && (/^\/v1\/customers(?:\/|$)/.test(path) || /^\/v1\/sites(?:\/[^/]+)?$/.test(path))) return ['GET','HEAD','POST','PATCH','PUT'].includes(method);
  if (/^\/v1\/sites\/[^/]+\/customer-users(?:\/|$)/.test(path)) return role === 'owner';
  if (/^\/v1\/mqtt-brokers(?:\/|$)/.test(path)) return role === "admin";
  if (/^\/v1\/sites\/[^/]+\/billing-source(?:\/|$)/.test(path)) return role === 'admin' && /^\/v1\/sites\/[^/]+\/billing-source$/.test(path) && ['GET','POST'].includes(method);
  if (path === "/v1/me/notification-feed") return method === "GET" || method === "HEAD";
  if (["/v1/me/notification-feed/read", "/v1/me/notification-feed/read-all"].includes(path)) return method === "PUT";
  const read = method === "GET" || method === "HEAD";
  if(path==='/v1/dashboard/comparison')return read;
  if (path === '/v1/auth/two-factor') return read;
  if (/^\/v1\/auth\/two-factor\/(?:enroll|confirm|disable|email-code)$/.test(path)) return method === 'POST';
  if(path === "/v1/operations/contracts/organization-defaults")return read&&["owner","admin"].includes(role);
  if (role === "owner" && ["/v1/dashboard/compare", "/v1/dashboard/power-flow"].includes(path)) return read;
  if (role === "customer_user" && path === "/v1/dashboard/power-flow") return read;
  if (path === "/v1/me/profile") return read || method === "PUT";
  if (path === '/v1/me/avatar') return method === 'PUT';
  if (path === "/v1/auth/password") return method === "PUT";
  // Audit is a read-only manager surface. Its service filters business/technical events.
  if (/^\/v1\/operations\/audit(?:\/|$)/.test(path)) return read && ["owner", "admin"].includes(role);
  if ((path === '/v1/users/invite' && method === 'POST') || (path === '/v1/users/invitations' && read) || (/^\/v1\/users\/invitations\/[^/]+\/resend$/.test(path) && method === 'POST')) return ['owner','admin'].includes(role);
  if (isBusinessRole(role)) {
    if (/^\/v1\/(?:users|mqtt-brokers|platform|sites|customers|gateways|devices|meter-presets|alerts|reports|history|jobs)(?:\/|$)/.test(path)) return false;
    if (/^\/v1\/operations(?:\/|$)/.test(path) && !/^\/v1\/operations\/(?:contracts|billing|invoices|receipts|documents)(?:\/|$)/.test(path)) return false;
    if (/^\/v1\/dashboard(?:\/|$)/.test(path) && !/^\/v1\/dashboard\/(?:summary|production|revenue|day)$/.test(path)) return false;
    if (/^\/v1\/settings(?:\/|$)/.test(path) && !/^\/v1\/settings\/(?:company|bank-accounts)(?:\/|$)/.test(path)) return false;
  }
  if(['/v1/platform/readiness','/v1/platform/monitoring'].includes(path))return read&&['owner','admin'].includes(role);
  if (/^\/v1\/(?:auth\/(?:me|capabilities)|me(?:\/preferences)?|notifications\/settings)$/.test(path)) return true;
  if (/^\/v1\/operations\/(?:users|audit)(?:\/|$)/.test(path)) return read && ["owner", "admin"].includes(role);
  if (/^\/v1\/(?:sites|customers|gateways|devices|meter-presets)(?:\/|$)/.test(path)) return read || role === "admin";
  if (path === "/v1/telemetry/ingest") return false; // MQTT is the only provisioned ingestion transport.
  if (/^\/v1\/billing-cycles\/[^/]+\/pay$/.test(path)) return method === "POST" && ["owner", "admin", "accountant", "customer_user"].includes(role);
  if(/^\/v1\/billing-cycles\/[^/]+\/verify-payment$/.test(path))return method==='PATCH'&&['owner','accountant'].includes(role);
  if (/^\/v1\/contracts\/[^/]+\/send-email$/.test(path)) return method === 'POST' && ['owner','admin'].includes(role);
  if (path === '/v1/contracts' && !read) return method === 'POST' && ['owner','admin'].includes(role);
  if (/^\/v1\/billing-cycles\/[^/]+\/(?:generate-invoice|verify-payment|status|adjust|send-email)$/.test(path) || path === '/v1/documents' && !read) return ['owner','admin','accountant'].includes(role);
  if (/^\/v1\/(?:billing-cycles|contracts|documents)(?:\/|$)/.test(path)) return read || ["owner", "admin", "accountant"].includes(role);
  if (/^\/v1\/settings(?:\/|$)/.test(path)) {
    if (read) return role !== "customer_user" || /\/settings\/(?:company|bank-accounts)(?:\/|$)/.test(path);
    return ["owner", "admin"].includes(role);
  }
  if (/^\/v1\/users(?:\/|$)/.test(path)) return ["owner", "admin"].includes(role);
  if (/^\/v1\/alerts(?:\/|$)/.test(path)) return read || ["owner", "admin", "operator"].includes(role);
  if (/^\/v1\/reports(?:\/|$)/.test(path)) return read || method === "POST";
  if(path==='/v1/history/restore')return method==='POST';
  if(path==='/v1/history/options')return read;
  if (/^\/v1\/jobs(?:\/|$)/.test(path)) return read || method === 'POST' && /^\/v1\/jobs\/[^/]+\/(cancel|retry)$/.test(path);
  return read && /^\/v1\/(?:dashboard|operations)(?:\/|$)/.test(path);
}
