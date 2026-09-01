import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { assertTransition } from "@solar/domain";
import type { BillingStatus } from "@solar/domain";
import { BillingCalculationService } from "./billing-calculation.service.js";
import type { BillingPreview, BillingPreviewInput } from "./billing-calculation.service.js";
@Injectable()
export class BillingCycleService {
  private readonly statements = new Map<string, BillingPreview & { status: BillingStatus; approvedBy?: string; finalizedAt?: Date }>();
  constructor(private readonly calculator: BillingCalculationService) {}
  preview(input: BillingPreviewInput): BillingPreview { const existing = this.statements.get(input.cycleKey); if (existing) return existing; const preview = this.calculator.preview(input); this.statements.set(input.cycleKey, preview); return preview; }
  approve(cycleKey: string, actorId: string, reason?: string) { const statement = this.statements.get(cycleKey); if (!statement) throw new NotFoundException("Billing cycle not found"); if ((statement.quality === "partial" || statement.quality === "estimated") && !reason?.trim()) throw new ConflictException("Approval reason is required for non-complete billing"); assertTransition(statement.status, "approved"); statement.status = "approved"; statement.approvedBy = actorId; return statement; }
  finalize(cycleKey: string) { const statement = this.statements.get(cycleKey); if (!statement) throw new NotFoundException("Billing cycle not found"); if (statement.quality === "invalid") throw new ConflictException("Invalid billing cannot be finalized"); assertTransition(statement.status, "finalized"); statement.status = "finalized"; statement.finalizedAt = new Date(); return statement; }
  get(cycleKey: string) { return this.statements.get(cycleKey); }
}
