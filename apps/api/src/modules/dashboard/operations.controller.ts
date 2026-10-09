import {documentPdfFilename} from '../documents/document-number.js';
import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import { type Response } from "express";
import { OperationsService } from "./operations.service.js";

export function toCsv(columns: string[], rows: Record<string, unknown>[], idKey = "id"): string {
  const keys=columns;
  const escape=(value:unknown)=>{
    let text=value===null||value===undefined?"":typeof value==="object"?JSON.stringify(value):String(value);
    if(typeof value==="string"&&/^\s*[=+@-]/.test(text))text="'"+text;
    return `"${text.replace(/"/g,'""')}"`;
  };
  const header = keys.map(escape).join(",");
  const bodyLines = rows.map(row => {
    const values = keys.map(key=>escape(row[key]));
    return values.join(",");
  });
  return [header, ...bodyLines].join("\r\n");
}

// Explicit projections prevent private/new API properties from silently becoming exports.
export const operationExportColumns: Record<string,string[]> = {
 schools:['code','name','region','capacityMwp','sitesCount','gatewaysCount','status'],
 sites:['externalSiteId','name','schoolName','externalGatewayId','gateway','protocol','capacityMwp','productionKwh','lastUpdated','status'],
 billing:['period','schoolName','externalSiteId','siteName','consumedKwh','rate','amount','status','invoiceNumber','receiptNumber'],
 contracts:['contractNumber','schoolName','externalSiteId','siteName','version','startDate','endDate','rate','signers','status'],
 documents:['documentNumber','type','schoolName','externalSiteId','siteName','issueDate','amount','status'],
 receipts:['receiptNumber','taxInvoiceNumber','schoolName','externalSiteId','siteName','issueDate','amount','status'],
 alerts:['title','detail','externalSiteId','siteName','severity','occurredAt','status'],
 notifications:['title','channel','recipient','sentAt','status','jobId'],
 reports:['title','category','scope','format','status','generatedAt','fileSize'],
 users:['displayName','email','role','schoolName','lastActive','status'],
 audit:['time','action','entityType','entityId','actor','reason','correlationId'],
};

@Controller("v1/operations")
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}


  @Get(":resource/summary")
  summary(@Param("resource") resource: string, @Req() req: any) {
    return this.operations.summary(resource, req?.user, req?.query);
  }

  @Get(":resource/export")
  async exportCsv(@Param("resource") resource: string, @Res() res: Response, @Req() req: any) {
    const {cursor: _cursor, ...filters} = req?.query ?? {};
    const data = await this.operations.list(resource, req?.user, {...filters, limit:'100'});
    let page = data.page;
    const seen = new Set<string>();
    while (page.hasMore && page.nextCursor) {
      if (seen.has(page.nextCursor)) throw new Error('Export cursor did not advance');
      seen.add(page.nextCursor);
      const batch = await this.operations.list(resource, req?.user, {...filters, limit:'100', cursor:page.nextCursor});
      data.rows.push(...batch.rows);
      page = batch.page;
    }
    const internalReferenceKeys: Record<string,string>={sites:'siteInternalReference',schools:'schoolInternalReference',billing:'billingInternalReference',contracts:'contractInternalReference',documents:'documentInternalReference',receipts:'documentInternalReference',alerts:'alertInternalReference',notifications:'notificationInternalReference',reports:'reportInternalReference',users:'userInternalReference',audit:'auditInternalReference'};
    const referenceKey=internalReferenceKeys[resource]!;
    const csv = toCsv([...operationExportColumns[resource]!,referenceKey],data.rows.map(row=>({...row,[referenceKey]:row[data.idKey || 'id']})));
    const filename = `${resource}-${filters.from ?? 'all'}-${filters.to ?? 'all'}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader('X-Export-Scope', 'all-matching-rows');
    res.setHeader('X-Export-Truncated', 'false');
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get('documents/:id/pdf')
  async documentPdf(@Param('id') id:string,@Req() req:any,@Res() res:Response) {
    const artifact=await this.operations.documentPdf(id,req?.user);
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="${documentPdfFilename(artifact.documentNumber)}"`);
    res.setHeader('ETag',`"${artifact.sha256}"`);res.setHeader('Cache-Control','private, no-store');res.send(artifact.pdf_bytes);
  }
  @Get('contracts/recipient-options')
  contractRecipientOptions(@Req() req:any) {return this.operations.contractRecipientOptions(String(req?.query?.siteId??''),req?.user);}
  @Get("documents/:id")
  document(@Param("id") id:string,@Req() req:any) {return this.operations.document(id,req?.user);}

  @Get(":resource/records/:id")
  detail(@Param("resource") resource:string,@Param("id") id:string,@Req() req:any) {
    return this.operations.detail(resource,id,req?.user);
  }

  @Get(":resource")
  list(@Param("resource") resource: string, @Req() req: any) {
    return this.operations.list(resource, req?.user, req?.query);
  }
}


