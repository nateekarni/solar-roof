import { DatabaseService } from '../../database/database.service.js';
import { localFinancialBinding, TEST_FINANCIAL_POLICY_HASH } from './local-financial-policy.js';
/** Local execution evidence enables only the user-selected synthetic TEST policy.
 * verification_in_progress is not a production workflow verification claim. */
export async function localTestReadiness(db:DatabaseService|undefined) {
 const binding=localFinancialBinding();if(!binding||!db)return null;
 try {
  const row=(await db.query(`SELECT * FROM local_financial_test_policy WHERE fixture_marker=$1 AND environment_binding=$2 AND policy_hash=$3 AND workflow_state IN('verification_in_progress','verified') ORDER BY selected_at DESC LIMIT 1`,[process.env.LOCAL_FINANCIAL_FIXTURE_MARKER,binding,TEST_FINANCIAL_POLICY_HASH])).rows[0];
  if(!row?.selected_by||!row?.workflow_evidence?.runId||!row.workflow_evidence.startedAt||row.workflow_evidence.purpose!=='real_api_workflow_verification')return null;
  if(row.workflow_state==='verified'&&!row.workflow_evidence.completedAt)return null;
  return {accountingApprovalId:row.id,workflowVerificationId:row.workflow_evidence.runId,actions:['calculate','issue','approve_payment','send'] as const,scope:'TEST' as const,workflowState:row.workflow_state};
 }catch{return null;}
}
