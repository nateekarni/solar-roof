type Point={date:string;value:number|null};
export function financialTrend(billed:Point[],received:Point[]|undefined){
 const billedByDate=new Map(billed.map(point=>[point.date,point.value]));
 const receivedByDate=new Map(received?.map(point=>[point.date,point.value]));
 const dates=[...new Set([...billedByDate.keys(),...receivedByDate.keys()])].sort();
 // These are complete ledger aggregates: an absent transaction date is zero.
 // An absent series or explicit null still means unavailable.
 return dates.map(date=>({date,billed:billedByDate.has(date)?billedByDate.get(date)!:0,received:received===undefined?null:receivedByDate.has(date)?receivedByDate.get(date)!:0}));
}
