import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

const FINANCIAL_PREREQUISITES=new Set([
  'company.logo','company.name','company.tax_id','company.branch','company.address','company.phone','company.email','company.signatory','company.signature','company.default_bank','approval.confirmation',
  'environment.financial_writes','environment.smtp','environment.scheduler',
  'site.customer','site.service','site.tax','site.recipient','site.rate','site.meter','site.binding','site.boundary_readings','site.contract',
  'context.site','context.cycle','context.period','context.document','context.contract',
  'cycle.snapshot','cycle.calculation','cycle.invoice','cycle.correction','document.artifact','document.recipient',
]);
function financialFailureDetails(value:Record<string,unknown>) {
  const missing=Array.isArray(value.missing)?[...new Set(value.missing.filter((id):id is string=>typeof id==='string'&&FINANCIAL_PREREQUISITES.has(id)))]:[];
  const context:Record<string,string>={};
  if(value.context&&typeof value.context==='object'&&!Array.isArray(value.context)) {
    const source=value.context as Record<string,unknown>;
    for(const key of ['siteId','billingCycleId','documentId','contractId'])if(typeof source[key]==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source[key]))context[key]=source[key];
    for(const key of ['periodStart','periodEnd'])if(typeof source[key]==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(source[key])&&Number.isFinite(Date.parse(source[key]))&&new Date(source[key]).toISOString().slice(0,10)===source[key])context[key]=source[key];
  }
  return {missing,...(Object.keys(context).length?{context}:{})};
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error: string | undefined;
    let code: string | undefined;
    let details:Record<string,unknown>={};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string) || exception.message;
        error = (r.error as string) || undefined;
        if (typeof r.code === "string") code = r.code;
        if(code==='FUTURE_RATE_REPLACEMENT_REQUIRED')details={siteId:r.siteId,effectiveDate:r.effectiveDate,futureRates:r.futureRates,documents:r.documents};
        if(code==='FINANCIAL_NOT_READY')details=financialFailureDetails(r);
        if(code==='POSITION_NAME_EXISTS'&&r.position&&typeof r.position==='object'){
          const position=r.position as Record<string,unknown>;
          if(typeof position.id==='string'&&/^[0-9a-f-]{36}$/i.test(position.id)&&typeof position.name==='string'&&position.name.length<=120)details={position:{id:position.id,name:position.name}};
        }
      }
    } else if(exception instanceof Error && 'type' in exception && exception.type==='entity.too.large'){
      status=HttpStatus.PAYLOAD_TOO_LARGE;message='ไฟล์แนบมีขนาดเกินที่ระบบรองรับ';
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      ...(code ? { code } : {}),
      ...details,
      message,
      ...(error ? { error } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
