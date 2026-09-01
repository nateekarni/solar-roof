import { Injectable } from "@nestjs/common";
import { evaluateAlarm, gatewayStatus, type AlarmInput, type GatewayStatus } from "@solar/domain";
@Injectable()
export class AlarmService {
 private readonly open=new Map<string,AlarmInput>();
 evaluate(input:AlarmInput):AlarmInput|undefined { const alarm=evaluateAlarm(input); if(alarm) this.open.set(alarm.key,alarm); else this.open.delete(input.key); return alarm; }
 getGatewayStatus(lastSeen:Date|undefined,now:Date,expectedIntervalSeconds:number):GatewayStatus{return gatewayStatus(lastSeen,now,expectedIntervalSeconds);}
 listOpen():AlarmInput[]{return [...this.open.values()];}
}