import {Logger,type OnModuleDestroy,type OnModuleInit} from '@nestjs/common';
import type {DatabaseService} from '../../database/database.service.js';
import {metricsSnapshot} from './metrics.js';
import {PlatformAlertStore} from './platform-alert-store.js';
import {defaultMonitoringThresholds,monitoringConditions,readEvidenceFile,type MonitoringThresholds} from './platform-readiness.service.js';

export class PlatformMonitoringService implements OnModuleInit,OnModuleDestroy {
  private timer:ReturnType<typeof setTimeout>|undefined;
  private pending:Promise<void>|undefined;
  private stopped=false;
  private sustained=0;
  private previousRejected=0;
  private readonly logger=new Logger(PlatformMonitoringService.name);
  private readonly alerts:PlatformAlertStore;
  constructor(private readonly db:DatabaseService,private readonly env:NodeJS.ProcessEnv=process.env){this.alerts=new PlatformAlertStore(db.pool);}
  onModuleInit(){if(this.env.PLATFORM_MONITORING_ENABLED==='true')this.schedule();}
  private schedule(){if(this.stopped)return;this.timer=setTimeout(()=>{this.pending=this.sample().catch(()=>{this.logger.warn({event:'platform_monitoring_failed'});}).finally(()=>{this.pending=undefined;this.schedule();});},30000);this.timer.unref();}
  async onModuleDestroy(){this.stopped=true;clearTimeout(this.timer);await this.pending;}
  private thresholds():MonitoringThresholds{
    const setting=(name:string,fallback:number,min:number,max:number)=>{const value=this.env[name]===undefined?fallback:Number(this.env[name]);if(!Number.isFinite(value)||value<min||value>max)throw Error('invalid_monitoring_threshold');return value;};
    return {walLagSeconds:setting('PLATFORM_WAL_LAG_SECONDS',defaultMonitoringThresholds.walLagSeconds,60,86400),backupAgeSeconds:setting('PLATFORM_BACKUP_AGE_SECONDS',defaultMonitoringThresholds.backupAgeSeconds,3600,604800),diskPercent:setting('PLATFORM_DISK_PERCENT',80,50,99),statusAgeSeconds:180};
  }
  async sample():Promise<void>{
    const status=await readEvidenceFile(this.env.PLATFORM_BACKUP_STATUS_FILE??'/var/lib/solar-backup/status.json') as any;
    const exhausted=await this.db.query("SELECT count(*) AS count FROM platform_jobs WHERE status='failed' AND attempt>=4");
    const summaryStale=this.env.ENERGY_READ_MODEL_ENABLED==='true'&&(await this.db.query("SELECT EXISTS(SELECT 1 FROM energy_dirty_days WHERE dirtied_at<now()-interval '2 minutes') AS stale")).rows[0]!.stale===true;
    const metrics=metricsSnapshot();
    const rejected=metrics.filter(item=>item.name==='ingress_rejected').reduce((sum,item)=>sum+(item.value??0),0);
    const backlog=metrics.some(item=>item.name==='ingress_backlog'&&(item.value??0)>0);
    this.sustained=backlog||rejected>this.previousRejected?this.sustained+1:0;this.previousRejected=rejected;
    const disk=status&&typeof status.rawDiskUsedPercent==='number'&&Number.isFinite(status.rawDiskUsedPercent)&&status.rawDiskUsedPercent>=0&&status.rawDiskUsedPercent<=100?status.rawDiskUsedPercent:null;
    await this.alerts.observe(monitoringConditions(status,{diskPercent:disk,exhaustedJobs:Number(exhausted.rows[0]!.count),summaryStale,ingestionBacklog:this.sustained>=3},Date.now(),this.thresholds()));
    const url=this.env.PLATFORM_MONITORING_WEBHOOK_URL;
    if(url&&this.env.PLATFORM_MONITORING_RECEIVER_VERIFIED==='true'){
      const parsed=new URL(url);
      if(parsed.username||parsed.password||parsed.hash||!(parsed.protocol==='https:'||parsed.protocol==='http:'&&['127.0.0.1','localhost'].includes(parsed.hostname)))throw Error('invalid_monitoring_receiver');
      await this.alerts.deliverOne(url,this.env.PLATFORM_MONITORING_WEBHOOK_TOKEN);
    }
  }
  async snapshot(){return (await this.db.query('SELECT condition_key AS condition,active,first_seen_at AS "firstSeenAt",observed_at AS "observedAt",delivery_status AS "deliveryStatus",attempts FROM platform_monitoring_alerts ORDER BY active DESC,condition_key')).rows;}
}
