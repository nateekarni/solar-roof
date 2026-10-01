import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import { type Response } from "express";
import { OperationsService } from "./operations.service.js";

export function toCsv(columns: string[], rows: Record<string, unknown>[], idKey = "id"): string {
  const keys=rows[0] ? Object.keys(rows[0]).filter(key=>key!==idKey) : columns;
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
    const csv = toCsv(data.columns, data.rows, data.idKey || "id");
    const filename = `${resource}-first-100-${new Date().toISOString().slice(0, 10)}.csv`;
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader('X-Export-Scope', 'first-100-matching-rows');
    res.setHeader('X-Export-Truncated', String(data.page.hasMore));
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  }

  @Get(":resource")
  list(@Param("resource") resource: string, @Req() req: any) {
    return this.operations.list(resource, req?.user, req?.query);
  }
}
