export type AggregateBucket = "15m" | "hour" | "day" | "month";
export interface AggregatePoint { bucketStart: Date; bucket: AggregateBucket; value: number; sampleCount: number; quality: "complete" | "partial" | "estimated" | "invalid"; }
export function bucketStart(date: Date, bucket: AggregateBucket): Date {
  const d = new Date(date); d.setUTCSeconds(0,0);
  if (bucket === "15m") d.setUTCMinutes(Math.floor(d.getUTCMinutes()/15)*15);
  else if (bucket === "hour") d.setUTCMinutes(0);
  else if (bucket === "day") d.setUTCHours(0,0);
  else d.setUTCDate(1), d.setUTCHours(0,0);
  return d;
}
export function aggregate(values: readonly {timestamp: Date; value: number; quality: AggregatePoint["quality"]}[], bucket: AggregateBucket): AggregatePoint[] {
  const groups = new Map<number,{sum:number;count:number;quality:AggregatePoint["quality"]}>();
  for (const item of values) { const key=bucketStart(item.timestamp,bucket).getTime(); const current=groups.get(key)??{sum:0,count:0,quality:"complete"}; current.sum+=item.value; current.count++; if(item.quality==="invalid") current.quality="invalid"; else if(item.quality!=="complete"&&current.quality==="complete") current.quality=item.quality; groups.set(key,current); }
  return [...groups.entries()].sort(([a],[b])=>a-b).map(([key,g])=>({bucketStart:new Date(key),bucket,value:g.sum/sampleCount(g),sampleCount:g.count,quality:g.quality}));
}
function sampleCount(g:{count:number}):number{return g.count;}