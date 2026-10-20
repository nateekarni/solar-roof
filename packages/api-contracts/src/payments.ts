/** Settlement method. PromptPay is a transfer channel, not a settlement method. */
export type PaymentMethod = 'bank_transfer' | 'cash';
export type TransferChannel = 'bank_account' | 'promptpay';
export interface PaymentMetadata {
 payerName?: string | null;
 paymentMethod?: PaymentMethod | null;
 transferChannel?: TransferChannel | null;
 originBank?: string | null;
 originAccount?: string | null;
}
export interface PaymentSubmission extends PaymentMetadata {
 amount?: number | string;
 paidAt?: string;
 slipUrl?: string;
 evidenceKey?: string;
 note?: string;
}
export interface PaymentTransferRow extends PaymentMetadata {
 id: string; amount: string | null; status: string;
 verifiedAmount?: string | null;
 verifiedTransferAt?: string | null;
 declaredAmount?: string | null;
 declaredTransferAt?: string | null;
 slipUrl?: string | null;
 note?: string | null;
 submittedBy?: string | null;
 submittedByName?: string | null;
 transferReference?: string | null;
 transferDate?: string | null;
 submittedAt?: string | null;
 verifiedAt?: string | null;
 rejectionReason?: string | null;
 evidenceKey?: string | null;
}
export interface PaymentReview extends PaymentMetadata {
 paymentId: string;
 verifiedAmount?: string | number;
 verifiedTransferAt?: string;
 transferReference?: string;
}
export interface CashPaymentSubmission {
 amount: string | number;
 receivedAt: string;
 note?: string;
}
export interface CashPaymentResult {
 success: true;
 billingCycleStatus: string;
 outstandingAmount: string;
 paymentId: string;
 receipt: {id:string;documentNumber:string};
}
/** Blank and omitted fields mean unspecified; never infer payer details from receiving accounts. */
export function normalizePaymentMetadata(input: Record<string, unknown>): PaymentMetadata {
 const result:PaymentMetadata={};
 for(const [field,limit] of [['payerName',200],['paymentMethod',20],['transferChannel',20],['originBank',120],['originAccount',80]] as const){
  const raw=input[field];if(raw===undefined||raw===null)continue;
  if(typeof raw!=='string')throw new Error(field+' must be a string');
  const value=raw.trim();if(!value)continue;
  if(Array.from(value).length>limit)throw new Error(field+' exceeds '+limit+' characters');
  if(field==='paymentMethod'){
   if(value!=='bank_transfer'&&value!=='cash')throw new Error('paymentMethod must be bank_transfer or cash');
   result.paymentMethod=value;
  }else if(field==='transferChannel'){
   if(value!=='bank_account'&&value!=='promptpay')throw new Error('transferChannel must be bank_account or promptpay');
   result.transferChannel=value;
  }else result[field]=value;
 }
 if(result.paymentMethod==='bank_transfer'&&!result.transferChannel)throw new Error('transferChannel is required for bank_transfer');
 if(result.paymentMethod==='cash'&&result.transferChannel)throw new Error('transferChannel must be omitted for cash');
 if(!result.paymentMethod&&result.transferChannel)throw new Error('paymentMethod is required when transferChannel is provided');
 return result;
}
