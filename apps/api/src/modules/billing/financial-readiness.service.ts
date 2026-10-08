import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Capabilities, FinancialAction } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { localTestReadiness } from './local-test-readiness.js';
import { routeAllowed } from '../../common/auth/route-policy.js';

/** Production awaits persisted, reviewed accounting and workflow evidence.
 * A flag alone is never evidence. The environment-bound synthetic TEST verifier permits local execution only.
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
  constructor(@Inject(DatabaseService) private readonly db?: DatabaseService) {}
  async verifiedReadiness(): Promise<VerifiedFinancialReadiness | null> { return localTestReadiness(this.db); }
  async isLocalTestReady():Promise<boolean> { return (await localTestReadiness(this.db))?.scope==='TEST'; }
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
    const allowed: FinancialAction[] = !hasScope ? [] : ['owner','admin','accountant'].includes(role)
      ? ['calculate','issue','approve_payment','adjust','send'] : [];
    const enabled = await this.enabledActions();
    const operationsActions = hasScope ? [
      ['read_invoice','GET','/v1/operations/documents/fixture'],
      ['read_receipt','GET','/v1/operations/documents/fixture'],
      ['submit_payment','POST','/v1/billing-cycles/fixture/pay'],
    ].filter(([,method,path])=>routeAllowed(role,method!,path!)).map(([action])=>action!) : [];
    return {operationsActions,actions:[...(hasScope && routeAllowed(role,'POST','/v1/contracts') ? ['create_contract'] : []),...allowed.filter(action=>enabled.includes(action))],unavailable:Object.fromEntries(allowed.filter(action=>!enabled.includes(action)).map(action=>[action,'Financial workflows await verified accounting requirements and implementation readiness.']))};
  }
}



