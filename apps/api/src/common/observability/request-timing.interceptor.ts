import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { logRequest, observeDuration } from './metrics.js';
@Injectable()
export class RequestTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    response.locals.routeTemplate = typeof request.route?.path === 'string' ? request.route.path : 'unmatched';
    return next.handle();
  }
}
// Middleware starts before guards; finish observes the status after exception filters.
export function requestTimingMiddleware(request: Request, response: Response, next: NextFunction): void {
  const started = performance.now();
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);
  response.once('finish', () => {
    const route = response.locals.routeTemplate ?? (typeof request.route?.path === 'string' ? request.route.path : 'unmatched');
    const status = response.statusCode;
    observeDuration('request_duration', performance.now() - started, { 'route-template': route, method: request.method, status: String(status) });
    logRequest(requestId, request.method, route, status);
  });
  next();
}
