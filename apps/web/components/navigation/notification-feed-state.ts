import {canVisitPage} from '@solar/domain';

export interface NotificationFeedItem {
 id:string;title:string;detail:string;destination:string|null;createdAt:string;readAt:string|null;kind:'alert'|'workflow';severity?:string;
}
export interface NotificationFeed {rows:NotificationFeedItem[];unreadCount:number}
export function accessibleFeedRows<T extends {destination:string|null}>(rows:T[],role:string):T[] {
 return rows.filter(row=>row.destination===null||canVisitPage(role,row.destination));
}
/** An old read response must never alter a newly selected site or signed-in user. */
export async function markFeedRead(api:{put:(path:string,body:unknown)=>Promise<unknown>},scope:string,currentScope:()=>string,apply:()=>void,selection:{ids?:string[];siteId?:string}={}) {
 await api.put(selection.ids?'/v1/me/notification-feed/read':'/v1/me/notification-feed/read-all',selection.ids?{ids:selection.ids}:selection.siteId?{siteId:selection.siteId}:{});
 if(currentScope()===scope)apply();
}
