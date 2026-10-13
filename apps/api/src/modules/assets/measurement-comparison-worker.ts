import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { MeasurementComparisons } from './measurement-comparisons.js';

@Injectable()
export class MeasurementComparisonWorker implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setTimeout>;
 private stopping=false;
 private pending:Promise<void>|undefined;
 constructor(@Inject(DatabaseService) private db:DatabaseService){}
 onModuleInit(){if(process.env.COMPARISON_WORKER_ENABLED==='false')return;this.schedule();}
 private schedule(){if(this.stopping)return;this.timer=setTimeout(()=>{this.pending=this.tick().finally(()=>{this.pending=undefined;this.schedule();});},5000);this.timer.unref();}
 private async tick(){try{const comparisons=new MeasurementComparisons(this.db);for(let i=0;i<4&&!this.stopping;i++)if(!await comparisons.recomputeNext())break;}catch{new Logger(MeasurementComparisonWorker.name).warn('Comparison recompute failed; durable work retained for retry');}}
 async onModuleDestroy(){this.stopping=true;clearTimeout(this.timer);await this.pending;}
}
