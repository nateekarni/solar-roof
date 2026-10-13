import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { FinancialReadinessController } from './financial-readiness.controller.js';
import { FinancialReadinessService } from './financial-readiness.service.js';

@Module({imports:[DatabaseModule],controllers:[FinancialReadinessController],providers:[FinancialReadinessService],exports:[FinancialReadinessService]})
export class FinancialReadinessModule {}
