import { Injectable, Inject, Logger, type OnModuleInit,type OnModuleDestroy } from '@nestjs/common';
import { LocalFinancialApplicationService } from './local-financial-application.service.js';
import { localFinancialBinding } from './local-financial-policy.js';
@Injectable()
export class LocalFinancialScheduler implements OnModuleInit,OnModuleDestroy {
 private timer?:ReturnType<typeof setInterval>;private running=false;private readonly logger=new Logger(LocalFinancialScheduler.name);
 constructor(@Inject(LocalFinancialApplicationService) private readonly application:LocalFinancialApplicationService){}
 onModuleInit(){if(!localFinancialBinding()||process.env.FINANCIAL_WRITES_ENABLED!=='true')return;this.timer=setInterval(()=>void this.tick(),60000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async tick(now=new Date()){if(this.running)return;this.running=true;try{return await this.application.monthly(now);}catch(error){this.logger.warn((error as Error).message);}finally{this.running=false;}}
}
