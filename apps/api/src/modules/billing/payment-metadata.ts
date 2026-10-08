import { BadRequestException } from '@nestjs/common';
import { normalizePaymentMetadata, type PaymentMetadata } from '@solar/api-contracts';
export function reviewedPaymentMetadata(body: PaymentMetadata): PaymentMetadata {
 try{return normalizePaymentMetadata({...body});}catch(error){throw new BadRequestException((error as Error).message);}
}
