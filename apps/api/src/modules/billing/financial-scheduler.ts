import {Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy} from '@nestjs/common';
import {FinancialApplicationService} from './financial-application.service.js';
import {FinancialReadinessService} from '../financial-readiness/financial-readiness.service.js';

@Injectable()
export class FinancialScheduler implements OnModuleInit, OnModuleDestroy {
 private timer:ReturnType<typeof setInterval>|undefined;
 private running=false;
 private readonly logger=new Logger(FinancialScheduler.name);
 constructor(
  @Inject(FinancialApplicationService) private readonly application:FinancialApplicationService,
  @Inject(FinancialReadinessService) private readonly readiness:FinancialReadinessService,
 ){}
 async onModuleInit() {
  if(this.timer!==undefined||!this.flagsEnabled())return;
  try{await this.readiness.assertSchedulerEnabled();}
  catch{this.logger.warn('Financial scheduler awaits production readiness; redeploy after prerequisites are complete.');return;}
  this.timer=setInterval(()=>void this.tick(),60000);
  this.timer.unref();
 }
 onModuleDestroy(){if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}}
 private flagsEnabled(){return process.env.FINANCIAL_WRITES_ENABLED==='true'&&process.env.FINANCIAL_SCHEDULER_ENABLED==='true';}
 async tick(now=new Date()) {
  if(this.running||!this.flagsEnabled())return;
  this.running=true;
  try{await this.readiness.assertSchedulerEnabled();return await this.application.monthly(now);}
  catch{this.logger.warn('Financial scheduler run blocked or unavailable; saved jobs and delivery state are retained.');}
  finally{this.running=false;}
 }
}
