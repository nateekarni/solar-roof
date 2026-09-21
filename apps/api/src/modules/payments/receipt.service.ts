import { ConflictException, Injectable } from "@nestjs/common";
import { DocumentService } from "../documents/document.service.js";
import type { FinalDocument } from "../documents/document.service.js";
import { PaymentService } from "./payment.service.js";

@Injectable()
export class ReceiptService {
  constructor(
    private readonly payments: PaymentService,
    private readonly documents: DocumentService
  ) {}

  async issueForPayment(paymentId: string): Promise<FinalDocument> {
    const payment = await this.payments.get(paymentId);
    if (payment.status !== "paid") {
      throw new ConflictException("Payment must be paid before receipt can be issued");
    }

    const receipt = await this.documents.finalize({
      type: "receipt",
      year: new Date().getFullYear(),
      amount: payment.amount,
      snapshot: {
        paymentId,
        invoiceId: payment.invoiceId,
        billingCycleId: payment.billingCycleId,
        amount: payment.amount,
        paidAt: payment.paidAt?.toISOString(),
      },
    });

    return receipt;
  }
}
