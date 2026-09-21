import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { PaymentService } from "./payment.service.js";
import { ReceiptService } from "./receipt.service.js";

@Module({
  imports: [DatabaseModule, DocumentsModule],
  providers: [PaymentService, ReceiptService],
  exports: [PaymentService, ReceiptService],
})
export class PaymentsModule {}
