import type {PayloadDevice} from './payload-contracts';
export type DashboardMetric='energy'|'power';
export interface MetricSource{deviceId:string;tag:string}
export type MetricSources=Partial<Record<DashboardMetric,MetricSource>>;
export function metricSourceOptions(metric:DashboardMetric,devices:PayloadDevice[]):{value:string;label:string;source:MetricSource}[]{const tag=metric==='energy'?'solar.total_yield':'solar.active_power',units=metric==='energy'?['Wh','kWh']:['W','kW'];return devices.flatMap(device=>(device.fields??device.profileConfig?.fields??[]).filter(field=>field.tag===tag&&units.includes(field.targetUnit)).map(field=>({value:device.id+'|'+field.tag,label:device.name+' · '+field.displayName+' ('+field.targetUnit+')',source:{deviceId:device.id,tag:field.tag}})));}
