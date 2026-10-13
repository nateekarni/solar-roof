type Range={start:string;end:string};
const date=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const withinCap=(range:Range)=>{const a=new Date(range.start),b=new Date(range.end);return (b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()<=2;};
/** Date-only summaries compare complete Bangkok days, never a partial day against a full day. */
export function comparisonRanges(range:Range,today:string):{current:Range;previous:Range}|null {
 const end=range.end>=today?date(Date.parse(today)-86400000):range.end;
 if(end<range.start||!withinCap(range))return null;
 const days=(Date.parse(end)-Date.parse(range.start))/86400000+1;
 const previous={start:date(Date.parse(range.start)-days*86400000),end:date(Date.parse(range.start)-86400000)};
 return withinCap(previous)?{current:{start:range.start,end},previous}:null;
}
export function normalizedYield(kwh:number|null,capacityMwp:number):number|null {return kwh!==null&&Number.isFinite(kwh)&&Number.isFinite(capacityMwp)&&capacityMwp>0?kwh/(capacityMwp*1000):null;}
export function comparableDelta(current:number|null,previous:number|null,comparable:boolean):number|null {return comparable&&current!==null&&previous!==null&&previous>0?(current-previous)/previous*100:null;}
type SourceSite={id:string;sourceFingerprint?:string|null};
export function comparableSources(current:SourceSite[],previous:SourceSite[]):boolean {
 return current.length>0&&current.length===previous.length&&current.every(site=>Boolean(site.sourceFingerprint)&&previous.some(prior=>prior.id===site.id&&prior.sourceFingerprint===site.sourceFingerprint));
}
