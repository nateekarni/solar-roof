import { Module } from "@nestjs/common";
import { DocumentService, NumberSeriesService } from "./document.service.js";
import { FileStorageService } from "./file-storage.service.js";
import { VerificationService } from "./verification.service.js";
@Module({ providers: [NumberSeriesService, DocumentService, FileStorageService, VerificationService], exports: [NumberSeriesService, DocumentService, FileStorageService, VerificationService] })
export class DocumentsModule {}
