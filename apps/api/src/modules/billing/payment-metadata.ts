import { BadRequestException } from '@nestjs/common';
import { normalizePaymentMetadata, type PaymentMetadata } from '@solar/api-contracts';
export function reviewedPaymentMetadata(body: PaymentMetadata): PaymentMetadata {
 try{
  const compatible={...body} as Record<string,unknown>;
  const legacyMethod=typeof compatible.paymentMethod==='string'?compatible.paymentMethod.trim():compatible.paymentMethod;
  if(legacyMethod==='promptpay'){
   compatible.paymentMethod='bank_transfer';compatible.transferChannel='promptpay';
  }else if(legacyMethod==='bank_transfer'&&!compatible.transferChannel){
   compatible.paymentMethod='bank_transfer';
   compatible.transferChannel='bank_account';
  }
  return normalizePaymentMetadata(compatible);
 }catch(error){throw new BadRequestException((error as Error).message);}
}
