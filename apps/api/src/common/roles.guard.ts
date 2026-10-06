import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PlatformRole } from "@solar/domain";
import { ROLES_KEY } from "./roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException("Access denied: unauthenticated or invalid user role");
    }

    const hasRole = user.role === "admin" || requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(`Access denied: required roles [${requiredRoles.join(", ")}]`);
    }

    return true;
  }
}
