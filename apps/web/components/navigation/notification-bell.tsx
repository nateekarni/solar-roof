'use client';
import * as React from 'react';
import Link from 'next/link';
import {Bell,AlertTriangle,CheckCheck,X} from 'lucide-react';
import {useSessionUser} from '../../providers/session-user-provider';
import {useLocale} from '../../providers/locale-provider';
import {apiClient} from '../../lib/api-client';
import {Button} from '../ui/button';
import {Badge} from '../ui/badge';
import {Skeleton} from '../ui/skeleton';
import {Empty,EmptyHeader,EmptyMedia,EmptyTitle,EmptyDescription} from '../ui/empty';
import {Alert,AlertDescription} from '../ui/alert';
import {ResponsivePopover} from '../ui/responsive-popover';
import {accessibleFeedRows,markFeedRead,type NotificationFeed} from './notification-feed-state';

export function NotificationBell({siteId}:{siteId?:string|undefined}) {
 const user=useSessionUser(),th=useLocale()==='th';
 const scope=JSON.stringify([user.id,user.role,user.schoolId,siteId]);
 const currentScope=React.useRef(scope);currentScope.current=scope;
 const generation=React.useRef(0);
 const [open,setOpen]=React.useState(false),[loading,setLoading]=React.useState(true),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const [loaded,setLoaded]=React.useState(''),[feed,setFeed]=React.useState<NotificationFeed>({rows:[],unreadCount:0});
 const ready=loaded===scope;
 const rows=ready?feed.rows:[],count=ready?feed.unreadCount:0;
 const load=React.useCallback(async()=>{
  const request=++generation.current;setLoading(true);setError('');
  try {
   const result=await apiClient.get<NotificationFeed>('/v1/me/notification-feed'+(siteId?'?site_id='+encodeURIComponent(siteId):''));
   if(request!==generation.current||currentScope.current!==scope)return;
   const permitted=accessibleFeedRows(result.rows,user.role);
   setFeed({rows:permitted,unreadCount:permitted.length===result.rows.length?result.unreadCount:permitted.filter(row=>!row.readAt).length});setLoaded(scope);
  } catch {if(request===generation.current&&currentScope.current===scope){setError(th?'โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง':'Unable to load notifications. Please retry.');setLoaded(scope);setFeed({rows:[],unreadCount:0});}}
  finally {if(request===generation.current&&currentScope.current===scope)setLoading(false);}
 },[scope,siteId,user.role,th]);
 React.useEffect(()=>{
  setBusy(false);setOpen(false);void load();
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  window.addEventListener('focus',refresh);const interval=window.setInterval(refresh,60000);
  return()=>{generation.current++;window.removeEventListener('focus',refresh);window.clearInterval(interval);};
 },[load]);
 async function read(ids?:string[]) {
  if(busy)return;setBusy(true);setError('');const original=scope;
  try{await markFeedRead(apiClient,original,()=>currentScope.current,()=>{void load();},ids?{ids}:siteId?{siteId}:{});}
  catch {if(currentScope.current===original)setError(th?'บันทึกสถานะอ่านไม่สำเร็จ':'Unable to mark notifications as read.');}
  finally{if(currentScope.current===original)setBusy(false);}
 }
 return <ResponsivePopover open={open} onOpenChange={value=>{setOpen(value);if(value)void load();}} title={th?'การแจ้งเตือน':'Notifications'} sheetHeaderClassName="sr-only" showCloseButton={false}
  popoverClassName="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0"
  sheetClassName="inset-0 flex h-full max-h-screen w-full flex-col gap-0 overflow-hidden rounded-none bg-background p-0"
  trigger={<Button type="button" variant="ghost" size="icon" className="relative rounded-full" aria-label={th?'การแจ้งเตือน':'Notifications'}><Bell/>{count>0&&<span className="absolute right-1 top-1 size-2 rounded-full bg-destructive ring-2 ring-background"/>}<span className="sr-only">{count} {th?'รายการที่ยังไม่อ่าน':'unread'}</span></Button>}>
  <div className="flex items-center justify-between gap-2 border-b p-3"><div className="flex items-center gap-2"><span className="text-sm font-semibold">{th?'การแจ้งเตือน':'Notifications'}</span>{count>0&&<Badge variant="destructive">{count}</Badge>}</div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" disabled={busy||loading||!ready||count===0} onClick={()=>void read()} aria-label={th?'อ่านทั้งหมด':'Mark all as read'} title={th?'อ่านทั้งหมด':'Mark all as read'}><CheckCheck/></Button><Button type="button" variant="ghost" size="icon" onClick={()=>setOpen(false)} aria-label={th?'ปิด':'Close'}><X/></Button></div></div>
  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:max-h-96">
   {error&&<Alert variant="destructive" className="m-3 w-auto"><AlertDescription><span>{error}</span><Button type="button" variant="outline" onClick={()=>void load()}>{th?'ลองอีกครั้ง':'Retry'}</Button></AlertDescription></Alert>}
   {loading||!ready?<div className="flex flex-col gap-3 p-4" role="status" aria-label={th?'กำลังโหลดการแจ้งเตือน':'Loading notifications'}><Skeleton className="h-12 w-full"/><Skeleton className="h-12 w-full"/></div>:!error&&rows.length===0?<Empty className="rounded-none border-0 py-8"><EmptyHeader><EmptyMedia variant="icon"><Bell/></EmptyMedia><EmptyTitle>{th?'ไม่มีการแจ้งเตือน':'No notifications'}</EmptyTitle><EmptyDescription>{th?'รายการที่เกี่ยวข้องกับคุณจะแสดงที่นี่':'Notifications relevant to you will appear here.'}</EmptyDescription></EmptyHeader></Empty>:rows.map(row=>{
    const content=<><span className="mt-0.5 shrink-0 text-muted-foreground">{row.kind==='alert'?<AlertTriangle className="size-4"/>:<Bell className="size-4"/>}</span><span className="flex min-w-0 flex-1 flex-col gap-1"><span className="text-sm font-medium">{row.title}</span><span className="text-xs text-muted-foreground">{row.detail}</span><time dateTime={row.createdAt} className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(th?'th-TH':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(row.createdAt))}</time></span>{!row.readAt&&<span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">{th?'ยังไม่อ่าน':'Unread'}</span></span>}</>;
    return row.destination?<Button asChild variant="ghost" key={row.id} className="h-auto! justify-start rounded-none border-b p-3 text-left whitespace-normal"><Link href={row.destination} onClick={()=>{if(!row.readAt)void read([row.id]);setOpen(false);}}>{content}</Link></Button>:<Button type="button" variant="ghost" key={row.id} className="h-auto! justify-start rounded-none border-b p-3 text-left whitespace-normal" onClick={()=>{if(!row.readAt)void read([row.id]);}}>{content}</Button>;
   })}
  </div>
 </ResponsivePopover>;
}
