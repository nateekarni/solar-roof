import {type CanActivate,type ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import type {Request} from 'express';

export function isAllowedMutation({method,origin,hasCookie,hasBearer}:{method:string;origin?:string|undefined;hasCookie:boolean;hasBearer:boolean},webOrigin:string):boolean {
  if(['GET','HEAD','OPTIONS'].includes(method.toUpperCase()))return true;
  if(origin!==undefined)return origin===webOrigin;
  return !hasCookie&&hasBearer;
}

export function isAllowedRequestOrigin(request:Request,webOrigin:string):boolean {
  const origin=request.headers.origin;
  const allowed=isAllowedMutation({method:request.method,origin,hasCookie:!!request.headers.cookie,hasBearer:/^Bearer\s+\S+$/i.test(request.headers.authorization ?? '')},webOrigin);
  // Match Express's case-insensitive public routes, including a trailing slash.
  const requiresOrigin=request.method==='POST'&&/^\/v1\/auth\/(login|refresh|activate)\/?$/i.test(request.path);
  return allowed&&(!requiresOrigin||origin!==undefined);
}

/** CORS controls response visibility; this guard prevents the mutation itself. */
@Injectable()
export class RequestOriginGuard implements CanActivate {
  canActivate(context:ExecutionContext):boolean {
    const request=context.switchToHttp().getRequest<Request>();
    if(!isAllowedRequestOrigin(request,process.env.WEB_URL ?? 'http://localhost:3000'))throw new ForbiddenException('A matching request Origin is required');
    return true;
  }
}
