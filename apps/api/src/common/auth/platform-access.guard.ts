import { ForbiddenException, Inject, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DatabaseService } from "../../database/database.service.js";
import { IS_PUBLIC_KEY } from "../../modules/identity/public.decorator.js";
import { canGrantInvitation } from "../../modules/identity/invitation.service.js";
import { routeAllowed, customerScope } from "./route-policy.js";
import { authorizedRoute, permissionForRoute } from './domain-route-policy.js';
import { siteScope, type PermissionDomain } from './authorization.js';

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const path = String(req.path ?? req.url).split("?")[0]!.replace(/\/$/, "");
    if (!authorizedRoute(req.user, req.method, path)) throw new ForbiddenException("This action is not permitted for your current permissions");
    // Approval actions resolve every item through the controller's scoped query.
    // Generic lookup here mistakes the batch action for an ID and distinguishes
    // inaccessible from missing single items before their display-safe mapping.
    if (req.method === 'POST' && /^\/v1\/billing-cycles\/(?:[^/]+\/)?approve-issuance$/.test(path)) return true;
    if (['GET','HEAD'].includes(req.method) && /^\/v1\/billing-cycles\/[^/]+\/issuance-preview$/.test(path)) return true;
    const permission=permissionForRoute(req.method,path);
    const domain=permission?.split('.')[0] as PermissionDomain|undefined;
    const employeeSites=domain?siteScope(req.user,domain):null;
    if(req.user?.role==='owner' && /^\/v1\/sites(?:\/[^/]+)?$/.test(path) && ['POST','PATCH','PUT'].includes(req.method)) {
      const businessFields=new Set(['customerId','customerName','name','siteName','capacityMwp','latitude','longitude','status','timezone','serviceStartDate','paymentTermDays','reminderStartDays','reminderIntervalDays','impactConfirmed','expectedUpdatedAt']);
      if(Object.keys(req.body??{}).some(field=>!businessFields.has(field)))throw new ForbiddenException('Owner cannot modify technical site fields');
    }
    const scope = customerScope(req.user);
    // The legacy financial collection has no scoped query yet; use the scoped operations read model.
    if(scope !== null && req.method === "GET" && path === "/v1/contracts") throw new ForbiddenException("Use the scoped contract collection");
    if (path === "/v1/users/invite" && req.method === "POST") {
      const invitedRole=req.body?.role ?? "customer_user";
      if(!["owner","admin","operator","accountant","customer_user"].includes(invitedRole)) throw new ForbiddenException("Invalid invited role");
      if(!canGrantInvitation({...req.user,status:"active"},invitedRole,req.body.customerId ?? null)) throw new ForbiddenException("Cannot grant invitation role or customer scope");
      if(scope!==null) {
        if(!req.body.customerId && scope.length===1) req.body.customerId=scope[0];
        if(!scope.includes(req.body.customerId)) throw new ForbiddenException("Cannot invite outside assigned customer");
      }
    }
    if (/^\/v1\/users\/invitations\/[^/]+\/resend$/.test(path) && req.method === "POST") {
      const id=path.split("/")[4];
      const invitation=(await this.db.query('SELECT role,customer_id FROM user_invitations WHERE id::text=$1',[id])).rows[0];
      if(!invitation)throw new NotFoundException("Invitation not found");
      if(!canGrantInvitation({...req.user,status:'active'},invitation.role,invitation.customer_id))throw new ForbiddenException("Cannot resend outside invitation role or customer scope");
    }
    if (scope !== null && req.method === "POST" && path === "/v1/sites" && !req.body?.customerId) {
      const assigned = await this.db.query("SELECT id FROM customers WHERE id=ANY($1::uuid[]) AND name=$2", [scope, req.body?.customerName ?? ""]);
      if (!assigned.rows[0]) throw new ForbiddenException("Cannot create a site outside assigned customer");
      req.body.customerId = assigned.rows[0].id;
    }
    const resources: Array<{ sql: string; id: string }> = [];
    const parts = path.split("/").filter(Boolean);
    const kind = parts[1];
    const id = parts[2];
    const queries: Record<string, string> = {
      sites: "SELECT id AS site_id, customer_id FROM sites WHERE id::text = $1",
      customers: "SELECT id AS customer_id FROM customers WHERE id::text = $1",
      devices: "SELECT s.id AS site_id, s.customer_id FROM devices d JOIN sites s ON s.id=d.site_id WHERE d.id::text=$1",
      gateways: "SELECT s.id AS site_id,s.customer_id FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.name=$1 OR g.id::text=$1",
      "billing-cycles": "SELECT s.id AS site_id,s.customer_id FROM billing_cycles b JOIN sites s ON s.id=b.site_id WHERE b.id::text=$1",
      contracts: "SELECT s.id AS site_id,s.customer_id FROM contracts c JOIN sites s ON s.id=c.site_id WHERE c.id::text=$1",
      documents: "SELECT s.id AS site_id,s.customer_id FROM documents d JOIN sites s ON s.id=d.site_id WHERE d.id::text=$1",
      alerts: "SELECT s.id AS site_id,s.customer_id FROM alerts a JOIN sites s ON s.id=a.site_id WHERE a.id::text=$1",
    };
    if (kind && id && queries[kind] && !["test-connection", "acknowledge-all", "payload-preview", "identity-draft", "site-options"].includes(id)) resources.push({sql:queries[kind]!,id});
    for (const [field, resource] of [["siteId", "sites"], ["customerId", "customers"], ["deviceId", "devices"]]) {
      const value = req.body?.[field!];
      if (typeof value === "string" && value) resources.push({sql:queries[resource!]!,id:value});
    }
    if(req.body?.siteIds !== undefined) {
      if(!Array.isArray(req.body.siteIds) || req.body.siteIds.some((value:unknown)=>typeof value!=="string")) throw new ForbiddenException("Invalid site scope");
      for(const siteId of req.body.siteIds) resources.push({sql:queries.sites!,id:siteId});
    }
    // Check ownership even for mutations whose route otherwise allows the role.
    for (const resource of resources) {
      const result = await this.db.query(resource.sql, [resource.id]);
      if (!result.rows.length) throw new NotFoundException("Resource not found");
      if (result.rows.length !== 1) throw new ForbiddenException("Ambiguous resource identity");
      if (req.user?.role === 'customer_user' && result.rows[0]!.site_id && !req.user.assignedSiteIds?.includes(result.rows[0]!.site_id)) throw new ForbiddenException('Resource outside assigned site');
      if(employeeSites!==null&&result.rows[0]!.site_id&&!employeeSites.includes(result.rows[0]!.site_id))throw new ForbiddenException('Resource outside permission domain site scope');
      if (scope !== null && !result.rows.some(row => scope.includes(row.customer_id))) throw new ForbiddenException("Resource outside assigned customer");
    }
    if (scope?.length === 0 && !/^\/v1\/(auth|me|notifications)(\/|$)/.test(path)) throw new ForbiddenException("No customer assigned");
    return true;
  }
}
