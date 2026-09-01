import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { canAccess, type AccessAction, type AccessResource } from "@solar/domain";

@Injectable()
export class SchoolScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { id: string; role: "owner" | "admin" | "school_user"; schoolId?: string; assignedSchoolIds?: string[]; assignedSiteIds?: string[] }; scope?: AccessResource; headers: Record<string, string | string[] | undefined> }>();
    const action = (request.headers["x-access-action"] ?? "read") as AccessAction;
    if (!request.user || !canAccess(request.user, action, request.scope ?? {})) {
      throw new ForbiddenException("Resource outside assigned scope");
    }
    return true;
  }
}