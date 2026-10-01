import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Capabilities, FinancialAction } from '@solar/api-contracts';
import { routeAllowed } from '../../common/auth/route-policy.js';

/** F2 must supply a verifier for persisted, reviewed accounting and workflow evidence.
 * A flag or administrator-authored setting is not evidence. No verifier is authorized yet.
 */
export interface VerifiedFinancialReadiness {
  accountingApprovalId: string;
  workflowVerificationId: string;
  actions: readonly FinancialAction[];
}
export interface FinancialReadinessEvidence {
  verifiedReadiness(): Promise<VerifiedFinancialReadiness | null>;
}
@Injectable()
export class FinancialReadinessService implements FinancialReadinessEvidence {
  async verifiedReadiness(): Promise<VerifiedFinancialReadiness | null> { return null; }
  private async enabledActions(): Promise<readonly FinancialAction[]> {
    if (process.env.FINANCIAL_WRITES_ENABLED !== 'true') return [];
    const evidence = await this.verifiedReadiness();
    return evidence?.accountingApprovalId && evidence.workflowVerificationId ? evidence.actions : [];
  }
  async assertEnabled(action: FinancialAction): Promise<void> {
    if (!(await this.enabledActions()).includes(action)) {
      throw new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',message:'Financial workflows await verified accounting requirements and implementation readiness.'});
    }
  }
  async capabilities(role: string, hasScope: boolean): Promise<Capabilities> {
    const allowed: FinancialAction[] = !hasScope ? [] : ['owner','accountant'].includes(role)
      ? ['calculate','issue','approve_payment','adjust','send'] : role === 'admin' ? ['calculate'] : [];
    const enabled = await this.enabledActions();
    return {actions:[...(hasScope && routeAllowed(role,'POST','/v1/contracts') ? ['create_contract'] : []),...allowed.filter(action=>enabled.includes(action))],unavailable:Object.fromEntries(allowed.filter(action=>!enabled.includes(action)).map(action=>[action,'Financial workflows await verified accounting requirements and implementation readiness.']))};
  }
}
