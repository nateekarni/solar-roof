import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { DocumentService, NumberSeriesService } from "./document.service.js";
import { DocumentsController } from "./documents.controller.js";
import { FileStorageService } from "./file-storage.service.js";
import { VerificationService } from "./verification.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [DocumentsController],
  providers: [NumberSeriesService, DocumentService, FileStorageService, VerificationService],
  exports: [NumberSeriesService, DocumentService, FileStorageService, VerificationService],
})
export class DocumentsModule {}
