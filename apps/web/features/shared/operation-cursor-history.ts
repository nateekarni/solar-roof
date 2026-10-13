type HistoryStorage=Pick<Storage,'getItem'|'setItem'>;
function key(resource:string,query:string){const params=new URLSearchParams(query);params.sort();return `operation-cursor-history:${resource}:${params}`;}
export function saveCursorHistory(storage:HistoryStorage,resource:string,query:string,cursors:readonly string[]){
 try{storage.setItem(key(resource,query),JSON.stringify(cursors));}catch{/* Navigation remains available when storage is full. */}
}
export function readCursorHistory(storage:HistoryStorage,resource:string,query:string):string[]{
 try{const value:unknown=JSON.parse(storage.getItem(key(resource,query))??'null');return Array.isArray(value)&&value.every(item=>typeof item==='string')?value:[];}catch{return [];}
}
