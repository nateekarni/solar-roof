import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../../database/database.service.js";

import { FinancialReadinessService } from "../billing/financial-readiness.service.js";
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
    await this.readiness.assertEnabled('issue');
    const siteId = body.siteId;
    const type = (body.type || "invoice").toLowerCase();
    const amount = Number(body.amount ?? 15000);
    const issueDate = body.issueDate || new Date().toISOString().slice(0, 10);
    const fileKey = body.fileKey || `docs/${type}-${Date.now()}.pdf`;

    if (!siteId) {
      throw new BadRequestException("siteId is required");
    }

    const countRes = await this.db.query("SELECT count(*)::int AS count FROM documents WHERE document_type = $1", [type]);
    const count = (countRes.rows[0]?.count ?? 0) + 1;
    const prefix = type === "receipt" ? "RCT" : type === "billing_statement" ? "STM" : "INV";
    const documentNumber = `${prefix}-${new Date().getFullYear()}-${String(count).padStart(4, "0")}`;
    const id = randomUUID();

    const sql = `
      INSERT INTO documents (
        id, site_id, document_type, document_number, status, issue_date, amount, file_key
      )
      VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)
      RETURNING id, site_id AS "siteId", document_type AS "documentType", document_number AS "documentNumber", status, issue_date AS "issueDate", amount
    `;
    const res = await this.db.query(sql, [id, siteId, type, documentNumber, issueDate, amount, fileKey]);
    return res.rows[0];
  }
}
