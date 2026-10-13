import { BadRequestException, ConflictException, Body, Controller, Inject, Post } from "@nestjs/common";

import { DatabaseService } from "../../database/database.service.js";

import { FinancialReadinessService } from "../financial-readiness/financial-readiness.service.js";
import { Roles } from "../../common/roles.decorator.js";
@Controller("v1/documents")
export class DocumentsController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(FinancialReadinessService) private readonly readiness: FinancialReadinessService) {}

  @Roles("owner", "accountant")
  @Post()
  async uploadDocument(@Body() body: {
    siteId?: string;
    type?: string;
    amount?: number;
    issueDate?: string;
    fileKey?: string;
  }) {
    await this.readiness.assertEnabled('issue',body.siteId?{siteId:body.siteId}:{});
    const siteId = body.siteId;
    const type = (body.type || "invoice").toLowerCase();
    if (!siteId) {
      throw new BadRequestException("siteId is required");
    }

    if(!['invoice','receipt'].includes(type))throw new BadRequestException('Unsupported human document family');
    throw new ConflictException('Issue financial documents through the audited billing cycle workflow');
  }
}
