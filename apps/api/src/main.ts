import "reflect-metadata";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import type {Request,Response,NextFunction} from 'express';
import {isAllowedRequestOrigin} from './common/auth/request-origin.guard.js';
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/http-exception.filter.js";
import { RequestTimingInterceptor, requestTimingMiddleware } from "./common/observability/request-timing.interceptor.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestTimingInterceptor());
  app.use(requestTimingMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { statusCode: 429, message: "Too many authentication requests, please try again in 1 minute" },
  });

  const expressApp = app.getHttpAdapter().getInstance();
  // CIDR trust is evaluated from the actual socket outwards, never by hop count.
  // Empty configuration ignores every caller-supplied forwarding header.
  const trustedProxyCidrs=(process.env.TRUSTED_PROXY_CIDRS ?? '').split(',').map(value=>value.trim()).filter(Boolean);
  if(process.env.API_EDGE_ENABLED==='true'&&!trustedProxyCidrs.length)throw new Error('Direct edge routing requires verified TRUSTED_PROXY_CIDRS');
  if(trustedProxyCidrs.some(value=>!value.includes('/')||/^(0\.0\.0\.0\/0|::\/0)$/.test(value)))throw new Error('TRUSTED_PROXY_CIDRS requires explicit bounded CIDRs');
  expressApp.set("trust proxy", trustedProxyCidrs.length ? trustedProxyCidrs : false);
  const webOrigin = process.env.WEB_URL ?? "http://localhost:3000";
  expressApp.use((request:Request,response:Response,next:NextFunction)=>{
    if(!isAllowedRequestOrigin(request,webOrigin)) {
      response.status(403).json({statusCode:403,message:'A matching request Origin is required',error:'Forbidden'});
      return;
    }
    next();
  });
  expressApp.use("/v1/auth/login", authLimiter);
  expressApp.use("/v1/auth/refresh", authLimiter);

  // Enable CORS — required for browser-to-API cross-origin requests
  // WEB_URL must be set in .env for production. Defaults to localhost:3000 for dev.
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      if (origin === webOrigin) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Auth-Retry-Safe"],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Solar Energy Management API")
    .setDescription("Multi-school solar monitoring, billing and documents API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  process.stdout.write(`API listening on http://0.0.0.0:${port}\n`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
