import { BadRequestException } from '@nestjs/common';

export function validateCadence(input:unknown):{expectedIntervalSeconds:number;pollGroups:Record<string,number>} {
 if(!input||typeof input!=='object')throw new BadRequestException('Cadence is required');
 const value=input as Record<string,unknown>;
 const interval=(v:unknown)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<1||v>86400)throw new BadRequestException('Cadence must be 1–86400 seconds');return v;};
 const expectedIntervalSeconds=interval(value.expectedIntervalSeconds);
 if(!value.pollGroups||typeof value.pollGroups!=='object'||Array.isArray(value.pollGroups))throw new BadRequestException('Poll groups must be an object');
 const pollGroups:Record<string,number>={};
 for(const [key,v] of Object.entries(value.pollGroups)){if(!/^[A-Za-z0-9_.-]{1,128}$/.test(key))throw new BadRequestException('Invalid poll group');pollGroups[key]=interval(v);}
 return {expectedIntervalSeconds,pollGroups};
}
export interface ComparisonPoint {time:number;value:number;quality?:string}
export interface ComparisonInput {kind:'energy'|'power';left:ComparisonPoint[];right:ComparisonPoint[];leftCadenceSeconds:number;rightCadenceSeconds:number;windowSeconds?:number;windowStart?:number;windowEnd?:number;relativeTolerance?:number;absoluteFloor?:number}
export function compareWindow(input:ComparisonInput):{state:'ok'|'mismatch'|'insufficient'|'invalid';left?:number;right?:number;difference?:number;threshold?:number;windowSeconds:number} {
 const windowSeconds=Math.max(900,input.windowSeconds??900,2*input.leftCadenceSeconds,2*input.rightCadenceSeconds);
 const empty={state:'insufficient' as const,windowSeconds};
 const valid=(points:ComparisonPoint[])=>points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&(!p.quality||['good','complete','ok'].includes(p.quality))).sort((a,b)=>a.time-b.time);
 const bounds=(points:ComparisonPoint[],cadence:number)=>{
  const rows=valid(points);if(input.windowStart===undefined||input.windowEnd===undefined||!rows.length)return rows;
  if(input.kind==='power')return rows.filter(p=>p.time>=input.windowStart!&&p.time<=input.windowEnd!);
  const nearest=(time:number)=>rows.reduce((best,p)=>Math.abs(p.time-time)<Math.abs(best.time-time)?p:best);
  const start=nearest(input.windowStart),end=nearest(input.windowEnd);
  if(Math.abs(start.time-input.windowStart)>cadence*1000||Math.abs(end.time-input.windowEnd)>cadence*1000)return [];
  return rows.filter(p=>p.time>=start.time&&p.time<=end.time);
 };
 const left=bounds(input.left,input.leftCadenceSeconds),right=bounds(input.right,input.rightCadenceSeconds);if(!left.length||!right.length)return empty;
 let a:number,b:number;
 if(input.kind==='energy'){
  if(left.length<2||right.length<2)return empty;
  const l0=left[0]!,l1=left.at(-1)!,r0=right[0]!,r1=right.at(-1)!;
  const alignment=Math.max(input.leftCadenceSeconds,input.rightCadenceSeconds)*1000;
  const boundaryTolerance=input.windowStart!==undefined&&input.windowEnd!==undefined?2*alignment:0;
  if(Math.min(l1.time-l0.time,r1.time-r0.time)<windowSeconds*1000-boundaryTolerance||Math.abs(l0.time-r0.time)>alignment||Math.abs(l1.time-r1.time)>alignment)return empty;
  // A reset anywhere in the window invalidates the interval, even if its final counter recovered.
  if(left.some((p,i)=>i>0&&p.value<left[i-1]!.value)||right.some((p,i)=>i>0&&p.value<right[i-1]!.value))return {state:'invalid',windowSeconds};
  if(left.some((p,i)=>i>0&&p.time-left[i-1]!.time>2*input.leftCadenceSeconds*1000)||right.some((p,i)=>i>0&&p.time-right[i-1]!.time>2*input.rightCadenceSeconds*1000))return empty;
  a=l1.value-l0.value;b=r1.value-r0.value;
 }else{
  const l=left.at(-1)!;
  const nearest=right.reduce((best,p)=>Math.abs(p.time-l.time)<Math.abs(best.time-l.time)?p:best);
  if(Math.abs(nearest.time-l.time)>Math.min(input.leftCadenceSeconds,input.rightCadenceSeconds)*1000)return empty;
  a=l.value;b=nearest.value;
 }
 const difference=Math.abs(a-b),threshold=Math.max(input.absoluteFloor??0.1,(input.relativeTolerance??0.05)*Math.max(Math.abs(a),Math.abs(b)));
 return {state:difference>threshold?'mismatch':'ok',left:a,right:b,difference,threshold,windowSeconds};
}
