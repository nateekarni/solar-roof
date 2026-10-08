/** Optional descriptive evidence for the existing bank-transfer submission workflow. */
export type TransferPaymentMethod = 'bank_transfer' | 'promptpay';
export interface PaymentMetadata {
 payerName?: string | null;
 paymentMethod?: TransferPaymentMethod | null;
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
 id: string; amount: string; status: string;
 transferDate?: string | null;
 submittedAt?: string | null;
 verifiedAt?: string | null;
 rejectionReason?: string | null;
 evidenceKey?: string | null;
}
/** Blank and omitted fields mean unspecified; never infer payer details from receiving accounts. */
export function normalizePaymentMetadata(input: Record<string, unknown>): PaymentMetadata {
 const result:PaymentMetadata={};
 for(const [field,limit] of [['payerName',200],['paymentMethod',20],['originBank',120],['originAccount',80]] as const){
  const raw=input[field];if(raw===undefined||raw===null)continue;
  if(typeof raw!=='string')throw new Error(field+' must be a string');
  const value=raw.trim();if(!value)continue;
  if(Array.from(value).length>limit)throw new Error(field+' exceeds '+limit+' characters');
  if(field==='paymentMethod'){
   if(value!=='bank_transfer'&&value!=='promptpay')throw new Error('paymentMethod must be bank_transfer or promptpay');
   result.paymentMethod=value;
  }else result[field]=value;
 }
 return result;
}
