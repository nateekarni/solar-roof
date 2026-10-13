export type FinancialResource = 'billing' | 'receipts';
export type RecordNavigation = {resource:FinancialResource;ids:string[];query:string};
type RecordPage = {rows:Array<{id?:unknown}>;page:{hasMore:boolean;nextCursor?:string|null}};
const queryKeys=['search','sort','direction','from','to','limit','cursor','siteId','collectionStatus','status'];
export function financialListHref(resource:string,query:string) {
 const path=resource==='receipts'?'/receipts':'/billing';
 return path+(query?'?'+query:'');
}
export function recordNeighbors(ids:readonly string[],id:string) {
 const index=ids.indexOf(id);
 return {previous:index>0?ids[index-1]!:null,next:index>=0&&index<ids.length-1?ids[index+1]!:null,index,total:ids.length};
}
export async function collectRecordIds(resource:FinancialResource,query:string,get:(url:string)=>Promise<RecordPage>) {
 const input=new URLSearchParams(query),params=new URLSearchParams();
 for(const key of queryKeys){const value=input.get(key);if(value!==null&&key!=='cursor')params.set(key,value);}
 const ids:string[]=[],seenIds=new Set<string>(),seenCursors=new Set<string>();
 while(true){
  const page=await get(`/v1/operations/${resource}?${params}`);
  for(const row of page.rows){if(typeof row.id==='string'&&!seenIds.has(row.id)){ids.push(row.id);seenIds.add(row.id);}}
  if(!page.page.hasMore)break;
  const cursor=page.page.nextCursor;
  if(!cursor||seenCursors.has(cursor))throw new Error('Invalid repeated pagination cursor');
  seenCursors.add(cursor);params.set('cursor',cursor);
 }
 return ids;
}
const prefix='financial-record-navigation:';
export function saveRecordNavigation(value:RecordNavigation):string {
 const token=crypto.randomUUID();
 // Keep only a small number of browsing sessions; store IDs, never financial data.
 const keys=Object.keys(sessionStorage).filter(key=>key.startsWith(prefix));
 for(const key of keys.slice(0,Math.max(0,keys.length-7)))sessionStorage.removeItem(key);
 sessionStorage.setItem(prefix+token,JSON.stringify(value));
 return token;
}
export function readRecordNavigation(token:string,resource:FinancialResource):RecordNavigation|null {
 try{
  const value:unknown=JSON.parse(sessionStorage.getItem(prefix+token)||'null');
  if(!value||typeof value!=='object')return null;
  const candidate=value as Partial<RecordNavigation>;
  return candidate.resource===resource&&typeof candidate.query==='string'&&Array.isArray(candidate.ids)&&candidate.ids.every(id=>typeof id==='string')?candidate as RecordNavigation:null;
 }catch{return null;}
}
export function recordDetailHref(resource:FinancialResource,id:string,token:string) {
 return `/records/${resource}/${encodeURIComponent(id)}?navigation=${encodeURIComponent(token)}`;
}
