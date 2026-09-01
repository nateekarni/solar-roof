export type GatewayStatus = "online" | "degraded" | "offline";
export type AlarmSeverity = "info" | "warning" | "critical";
export function gatewayStatus(lastSeen: Date | undefined, now: Date, expectedIntervalSeconds: number): GatewayStatus {
  if(!lastSeen) return "offline";
  const age=(now.getTime()-lastSeen.getTime())/1000;
  if(age>expectedIntervalSeconds*3) return "offline";
  if(age>expectedIntervalSeconds*2) return "degraded";
  return "online";
}
export interface AlarmInput { key:string; severity:AlarmSeverity; message:string; active:boolean; }
export function evaluateAlarm(input: AlarmInput): AlarmInput | undefined { return input.active ? input : undefined; }