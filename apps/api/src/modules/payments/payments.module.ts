import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module.js";
import { PaymentService } from "./payment.service.js";
import { ReceiptService } from "./receipt.service.js";
@Module({ imports: [DocumentsModule], providers: [PaymentService, ReceiptService], exports: [PaymentService, ReceiptService] })
export class PaymentsModule {}
