import { ConflictException, Injectable } from "@nestjs/common";
import { DocumentService } from "../documents/document.service.js";
import type { FinalDocument } from "../documents/document.service.js";
import { PaymentService } from "./payment.service.js";
@Injectable()
export class ReceiptService { private readonly receipts = new Map<string, FinalDocument>(); constructor(private readonly payments: PaymentService, private readonly documents: DocumentService) {} async issueForPayment(paymentId: string): Promise<FinalDocument> { const payment = this.payments.get(paymentId); if (payment.status !== "paid") throw new ConflictException("Payment must be paid before receipt"); const existing = this.receipts.get(paymentId); if (existing) return existing; const receipt = await this.documents.finalize({ type: "receipt", year: new Date().getFullYear(), snapshot: { paymentId, invoiceId: payment.invoiceId, amount: payment.amount, paidAt: payment.paidAt?.toISOString() } }); this.receipts.set(paymentId, receipt); return receipt; } }
