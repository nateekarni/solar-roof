import { ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { permissionForRoute } from './domain-route-policy.js';
import { hasPermission, type AuthorizationPrincipal } from './authorization.js';

export const REQUIRED_ROLES = "required_roles";
export const RequireRoles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const roles = Reflect.getMetadata(REQUIRED_ROLES, context.getHandler()) as string[] | undefined;
    if (!roles || roles.length === 0) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthorizationPrincipal;method?:string;path?:string;url?:string }>();
    const permission=permissionForRoute(request.method??'',request.path??request.url??'');
    if(request.user?.authorization&&permission&&hasPermission(request.user,permission))return true;
    if (!request.user?.role || !roles.includes(request.user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
