import { ForbiddenException, Inject, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DatabaseService } from "../../database/database.service.js";
import { IS_PUBLIC_KEY } from "../../modules/identity/public.decorator.js";
import { routeAllowed, schoolScope } from "./route-policy.js";

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const path = String(req.path ?? req.url).split("?")[0]!.replace(/\/$/, "");
    if (!routeAllowed(req.user?.role ?? "", req.method, path)) throw new ForbiddenException("This action is not permitted for your role");
    const scope = schoolScope(req.user);
    // The legacy financial collection has no scoped query yet; use the scoped operations read model.
    if(scope !== null && req.method === "GET" && path === "/v1/contracts") throw new ForbiddenException("Use the scoped contract collection");
    if (path === "/v1/users/invite" && req.method === "POST") {
      const invitedRole=req.body?.role ?? "school_user";
      if(!["owner","admin","operator","accountant","school_user"].includes(invitedRole)) throw new ForbiddenException("Invalid invited role");
      if(req.user.role !== "owner" && invitedRole !== "school_user") throw new ForbiddenException("Only owner can grant platform roles");
      if(scope!==null) {
        if(!req.body.schoolId && scope.length===1) req.body.schoolId=scope[0];
        if(!scope.includes(req.body.schoolId)) throw new ForbiddenException("Cannot invite outside assigned school");
      }
    }
    if (scope !== null && req.method === "POST" && path === "/v1/sites" && !req.body?.schoolId) {
      const assigned = await this.db.query("SELECT id FROM schools WHERE id=ANY($1::uuid[]) AND name=$2", [scope, req.body?.schoolName ?? ""]);
      if (!assigned.rows[0]) throw new ForbiddenException("Cannot create a site outside assigned school");
      req.body.schoolId = assigned.rows[0].id;
    }
    const resources: Array<{ sql: string; id: string }> = [];
    const parts = path.split("/").filter(Boolean);
    const kind = parts[1];
    const id = parts[2];
    const queries: Record<string, string> = {
      sites: "SELECT school_id FROM sites WHERE id::text = $1",
      schools: "SELECT id AS school_id FROM schools WHERE id::text = $1",
      devices: "SELECT s.school_id FROM devices d JOIN sites s ON s.id=d.site_id WHERE d.id::text=$1",
      gateways: "SELECT s.school_id FROM gateways g JOIN sites s ON s.id=g.site_id WHERE g.name=$1 OR g.id::text=$1",
      "billing-cycles": "SELECT s.school_id FROM billing_cycles b JOIN sites s ON s.id=b.site_id WHERE b.id::text=$1",
      contracts: "SELECT s.school_id FROM contracts c JOIN sites s ON s.id=c.site_id WHERE c.id::text=$1",
      documents: "SELECT s.school_id FROM documents d JOIN sites s ON s.id=d.site_id WHERE d.id::text=$1",
      alerts: "SELECT s.school_id FROM alerts a JOIN sites s ON s.id=a.site_id WHERE a.id::text=$1",
    };
    if (kind && id && queries[kind] && !["test-connection", "acknowledge-all"].includes(id)) resources.push({sql:queries[kind]!,id});
    for (const [field, resource] of [["siteId", "sites"], ["schoolId", "schools"], ["deviceId", "devices"]]) {
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
      if (scope !== null && !result.rows.some(row => scope.includes(row.school_id))) throw new ForbiddenException("Resource outside assigned school");
    }
    if (scope?.length === 0 && !/^\/v1\/(auth|me|notifications)(\/|$)/.test(path)) throw new ForbiddenException("No school assigned");
    return true;
  }
}
