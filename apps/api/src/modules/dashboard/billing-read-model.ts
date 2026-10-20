// Shared lifecycle SQL: b is the billing cycle, q is its projected collection row.
export const approvedAmount="coalesce((SELECT sum(coalesce(verified_amount,amount)) FROM payments WHERE billing_cycle_id=b.id AND status='paid'),0)";
export const daysOverdue="greatest(0,(now() AT TIME ZONE 'Asia/Bangkok')::date-b.due_date)";
export const collectionStatus=`CASE WHEN b.status IN ('draft','cancelled','superseded') OR NOT EXISTS(SELECT 1 FROM documents invoice WHERE invoice.billing_cycle_id=b.id AND invoice.document_type='invoice' AND invoice.is_current AND invoice.status IN('issued','finalized')) THEN NULL WHEN ${approvedAmount}>=b.amount THEN 'paid' WHEN EXISTS(SELECT 1 FROM payments WHERE billing_cycle_id=b.id AND status='pending_verification') THEN 'pending_review' WHEN ${approvedAmount}>0 THEN 'partially_paid' WHEN ${daysOverdue}>0 THEN 'overdue' ELSE 'awaiting_payment' END`;
// Project once from the collection result so rows, tab filters, and counts cannot drift.
export const billingStatusView=`CASE
 WHEN q.status='pending_issue_approval' OR q."pendingReplacement" IS NOT NULL THEN 'pending_issue_approval'
 WHEN q."collectionStatus"='pending_review' THEN 'pending_verification'
 WHEN q."collectionStatus"='partially_paid' THEN 'partially_paid'
 WHEN q."collectionStatus"='overdue' THEN 'overdue'
 WHEN q."collectionStatus"='paid' THEN 'paid'
 WHEN q."collectionStatus"='awaiting_payment' THEN 'awaiting_payment'
 ELSE 'unsuccessful' END`;
