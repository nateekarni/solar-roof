import {Controller,Get,Inject,Module} from '@nestjs/common';
import {DatabaseService} from '../../database/database.service.js';
import {PlatformReadinessService} from './platform-readiness.service.js';
import {PlatformMonitoringService} from './platform-monitoring.service.js';

@Controller('v1/platform')
class PlatformObservabilityController {
  constructor(@Inject(PlatformReadinessService) private readonly readiness:PlatformReadinessService,@Inject(PlatformMonitoringService) private readonly monitoring:PlatformMonitoringService){}
  @Get('readiness') evaluate(){return this.readiness.evaluate();}
  @Get('monitoring') alerts(){return this.monitoring.snapshot();}
}
@Module({controllers:[PlatformObservabilityController],providers:[
  {provide:PlatformReadinessService,useFactory:()=>new PlatformReadinessService()},
  {provide:PlatformMonitoringService,inject:[DatabaseService],useFactory:(db:DatabaseService)=>new PlatformMonitoringService(db)},
],exports:[PlatformReadinessService]})
export class PlatformObservabilityModule {}
